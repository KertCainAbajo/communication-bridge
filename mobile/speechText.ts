// Prepares any typed Filipino or Bisaya text so the built-in voices pronounce it clearly.
// The voices read letter by letter, so numbers, short forms and English words are respelled
// the way people say them.

export type LocalVoice = 'fil' | 'ceb';

const ones: Record<LocalVoice, string[]> = {
  fil: ['sero', 'isa', 'dalawa', 'tatlo', 'apat', 'lima', 'anim', 'pito', 'walo', 'siyam'],
  ceb: ['sero', 'usa', 'duha', 'tulo', 'upat', 'lima', 'unom', 'pito', 'walo', 'siyam'],
};
const tens: Record<LocalVoice, string[]> = {
  fil: ['', 'sampu', 'dalawampu', 'tatlumpu', 'apatnapu', 'limampu', 'animnapu', 'pitumpu', 'walumpu', 'siyamnapu'],
  ceb: ['', 'napulo', 'kawhaan', 'katloan', 'kap-atan', 'kalim-an', 'kan-uman', 'kapitoan', 'kawaloan', 'kasiyaman'],
};
const teensFilipino = ['', 'labing-isa', 'labindalawa', 'labintatlo', 'labing-apat', 'labinlima', 'labing-anim',
  'labimpito', 'labingwalo', 'labinsiyam'];

// "isang libo", "dalawang daan", "apat na raan" (Filipino); "usa ka libo", "duha ka gatos" (Bisaya).
function countOf(count: string, unit: 'hundred' | 'thousand', voice: LocalVoice): string {
  if (voice === 'ceb') return `${count} ka ${unit === 'hundred' ? 'gatos' : 'libo'}`;
  const unitWord = unit === 'hundred' ? 'daan' : 'libo';
  if (/[aeiou]$/.test(count)) return `${count}ng ${unitWord}`;
  if (/n$/.test(count)) return `${count}g ${unitWord}`;
  return `${count} na ${unit === 'hundred' ? 'raan' : unitWord}`;
}

// Filipino joins with "'t" or "at" (dalawampu't isa); Bisaya uses "ug" (kawhaan ug usa).
function joinParts(voice: LocalVoice, big: string, small: string): string {
  if (voice === 'fil') return /[aeiou]$/.test(big) ? `${big}'t ${small}` : `${big} at ${small}`;
  return `${big} ug ${small}`;
}

function numberToWords(value: number, voice: LocalVoice): string {
  if (value < 10) return ones[voice][value];
  if (value < 100) {
    if (voice === 'fil' && value > 10 && value < 20) return teensFilipino[value - 10];
    const ten = tens[voice][Math.floor(value / 10)];
    return value % 10 === 0 ? ten : joinParts(voice, ten, ones[voice][value % 10]);
  }
  if (value < 1000) {
    const hundreds = countOf(ones[voice][Math.floor(value / 100)], 'hundred', voice);
    return value % 100 === 0 ? hundreds : joinParts(voice, hundreds, numberToWords(value % 100, voice));
  }
  if (value < 1000000) {
    const thousands = countOf(numberToWords(Math.floor(value / 1000), voice), 'thousand', voice);
    return value % 1000 === 0 ? thousands : joinParts(voice, thousands, numberToWords(value % 1000, voice));
  }
  return String(value).split('').map((digit) => ones[voice][Number(digit)]).join(' ');
}

// Common English words in Taglish and Bislish, spelled the way Filipinos say them.
const englishLoanwords: Record<string, string> = {
  teacher: 'titser', school: 'iskul', classroom: 'klasrum', class: 'klas', okay: 'okey', ok: 'okey',
  phone: 'pon', cellphone: 'selpon', computer: 'kompyuter', tablet: 'tablet', charger: 'tsardyer',
  juice: 'dyus', chocolate: 'tsokolate', cake: 'keyk', ice: 'ays', cream: 'krim', icecream: 'ayskrim',
  birthday: 'bertdey', mall: 'mol', jeep: 'dyip', jeepney: 'dyipni', bus: 'bas', car: 'kar',
  nurse: 'nars', doctor: 'doktor', toilet: 'toylet', cr: 'si ar', bathroom: 'batrum', please: 'plis',
  sorry: 'sori', thank: 'tenk', thanks: 'tenks', you: 'yu', hello: 'helo', hi: 'hay', bye: 'bay',
  game: 'geym', games: 'geyms', year: 'yir', years: 'yirs', old: 'old', video: 'bidyo', youtube: 'yutub', facebook: 'pesbuk', happy: 'hapi', play: 'pley',
  break: 'breyk', recess: 'rises', lunch: 'lants', snack: 'snak', snacks: 'snaks', water: 'woter',
  tv: 'ti bi', television: 'telebisyon', movie: 'mubi', music: 'myusik', song: 'song', friend: 'prend',
  friends: 'prends', mommy: 'mami', daddy: 'dadi', mom: 'mam', dad: 'dad', baby: 'beybi', candy: 'kendi',
  bag: 'bag', shoes: 'syus', shirt: 'syert', pants: 'pants', ball: 'bol', toy: 'toy', toys: 'toys',
  homework: 'homwork', project: 'prodyek', exam: 'eksam', quiz: 'kwis', pencil: 'pensil', paper: 'peyper',
  book: 'buk', notebook: 'notbuk', chair: 'tser', table: 'teybol', door: 'dor', window: 'windo',
  sick: 'sik', headache: 'hedeyk', fever: 'pibar', medicine: 'medisin', help: 'help', wait: 'weyt',
  stop: 'istap', go: 'go', yes: 'yes', no: 'no', good: 'gud', morning: 'morning', night: 'nayt',
};

export function prepareForSpeech(text: string, voice: LocalVoice): string {
  return text
    // "thank you" as one word, as it is said.
    .replace(/\bthank\s+you\b/gi, 'tenkyu')
    // Short forms written without vowels.
    .replace(/\bmga\b/gi, 'manga')
    .replace(/\bng\b/gi, 'nang')
    // Numbers (with optional thousands commas) as words.
    .replace(/\d{1,3}(?:,\d{3})+|\d+/g, (match) => numberToWords(Number(match.replace(/,/g, '')), voice))
    // English words respelled; Filipino and Bisaya words are left as they are.
    .replace(/[A-Za-z']+/g, (word) => englishLoanwords[word.toLowerCase()] ?? word)
    .replace(/\s+/g, ' ')
    .trim();
}
