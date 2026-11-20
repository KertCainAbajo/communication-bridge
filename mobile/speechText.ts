// Prepares any typed Filipino or Bisaya text so the built-in voices pronounce it clearly.
// The voices read letter by letter, so numbers, short forms and English words are respelled
// the way people say them.

export type LocalVoice = 'fil' | 'ceb';

// Key for looking up natural recordings: ignores capitals, extra spaces and a final period.
// Must match normalizeSpeechKey() in scripts/generate-natural-audio.mjs.
export function normalizeSpeechKey(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}

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

// ---- Meta MMS voices (the built-in voices) ----
// MMS learned real Filipino and Bisaya spelling, so short forms like "mga" and "ng" stay as written.
// The voices only know letters: numbers become words, and English words inside Filipino or Bisaya
// are respelled the way Filipinos say them.
export type MmsVoice = 'en' | 'fil' | 'ceb';

const englishSmall = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const englishTens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberToEnglish(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 999999999) return String(value).split('').map((digit) => englishSmall[Number(digit)] ?? '').join(' ');
  if (value < 20) return englishSmall[value];
  if (value < 100) return `${englishTens[Math.floor(value / 10)]}${value % 10 ? ` ${englishSmall[value % 10]}` : ''}`;
  if (value < 1000) return `${englishSmall[Math.floor(value / 100)]} hundred${value % 100 ? ` ${numberToEnglish(value % 100)}` : ''}`;
  if (value < 1000000) return `${numberToEnglish(Math.floor(value / 1000))} thousand${value % 1000 ? ` ${numberToEnglish(value % 1000)}` : ''}`;
  return `${numberToEnglish(Math.floor(value / 1000000))} million${value % 1000000 ? ` ${numberToEnglish(value % 1000000)}` : ''}`;
}

export function prepareForMms(text: string, voice: MmsVoice): string {
  if (voice === 'en') {
    return text
      .replace(/\d{1,3}(?:,\d{3})+|\d+/g, (match) => numberToEnglish(Number(match.replace(/,/g, ''))))
      .replace(/&/g, ' and ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return text
    .replace(/\bthank\s+you\b/gi, 'tenkyu')
    .replace(/\d{1,3}(?:,\d{3})+|\d+/g, (match) => numberToWords(Number(match.replace(/,/g, '')), voice))
    .replace(/[A-Za-z']+/g, (word) => englishLoanwords[word.toLowerCase()] ?? word)
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Filipino and Bisaya read by the built-in English woman's voice ----
// The English voice reads English spelling, so each Filipino or Bisaya syllable is respelled the way an
// English reader says it: "gusto ko ng tubig" -> "goos-taw kaw nahng too-beeg". Vowels: a -> ah,
// e -> eh, i -> ee, o -> aw (British "aw" is closest to the Filipino o), u -> oo; ay -> eye, aw -> ow.
// English words inside the sentence (in englishLoanwords, or English-looking like "juice") stay as
// they are, so she says them naturally.
const respellVowels: Record<string, string> = { a: 'ah', e: 'eh', i: 'ee', o: 'aw', u: 'oo' };
const respellDiphthongs: Record<string, string> = { ay: 'eye', ai: 'eye', aw: 'ow', ao: 'ow', oy: 'oy', iw: 'ew', uy: 'ooey' };
const respellSpecial: Record<string, string> = { ng: 'nahng', mga: 'mah-ngah' };
const englishLooking = /[cfqvxz]|th|sh|ph|wh|ck|ee|oo|ght|tion/;

function respellWord(word: string): string {
  const lower = word.toLowerCase();
  if (respellSpecial[lower]) return respellSpecial[lower];
  if (englishLoanwords[lower] !== undefined || englishLooking.test(lower)) return word;
  const tokens = lower.match(/ng|ny|ts|[bdghjklmnprstwyñ]|[aeiou]/g) ?? [];
  const syllables: string[] = [];
  let onset = '';
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!respellVowels[token]) {
      onset += token;
      index += 1;
      continue;
    }
    const next = tokens[index + 1] ?? '';
    const afterNext = tokens[index + 2] ?? '';
    let nucleus: string;
    if (respellDiphthongs[token + next] && !respellVowels[afterNext]) {
      nucleus = respellDiphthongs[token + next];
      index += 2;
    } else {
      nucleus = respellVowels[token];
      index += 1;
    }
    const consonants: string[] = [];
    while (index < tokens.length && !respellVowels[tokens[index]]) {
      consonants.push(tokens[index]);
      index += 1;
    }
    // Before a vowel, the last consonant starts the next syllable.
    const nextOnset = index < tokens.length && consonants.length ? consonants.pop() ?? '' : '';
    syllables.push(onset + nucleus + consonants.join(''));
    onset = nextOnset;
  }
  if (onset) {
    if (syllables.length) syllables[syllables.length - 1] += onset;
    else syllables.push(onset);
  }
  // Hard g before e/i ("gee" would be read "jee").
  return syllables.map((syllable) => syllable.replace(/^g(?=ee|eh|eye)/, 'gh').replace(/ñ/g, 'ny')).join('-');
}

export function respellForEnglishVoice(text: string, voice: LocalVoice): string {
  return text
    .replace(/\d{1,3}(?:,\d{3})+|\d+/g, (match) => numberToWords(Number(match.replace(/,/g, '')), voice))
    .replace(/[A-Za-zñÑ]+/g, respellWord)
    .replace(/\s+/g, ' ')
    .trim();
}

// Filipino and Bisaya read by the phone's English voice (the built-in voice choice). Tested: the
// English voice is understood best when it reads the normal spelling, so only short forms and
// numbers are written out.
export function prepareForEnglishVoice(text: string, voice: LocalVoice): string {
  return text
    .replace(/\bmga\b/gi, 'manga')
    .replace(/\bng\b/gi, 'nang')
    .replace(/\d{1,3}(?:,\d{3})+|\d+/g, (match) => numberToWords(Number(match.replace(/,/g, '')), voice))
    .replace(/\s+/g, ' ')
    .trim();
}
