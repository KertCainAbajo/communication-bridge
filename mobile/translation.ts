// Offline English <-> Filipino translation for words added to the board.
// Uses the app's own phrase pairs, a built-in word list, and a few common sentence patterns.
// Returns null when it can't translate confidently, so a person can type the translation.

export type TranslationLanguage = 'en' | 'fil';

type PhraseSource = Record<TranslationLanguage, {
  messages: { uuid: string; title: string | null; message_text: string | null }[];
}>;

// [English, Filipino]. Keep entries lowercase. The first entry wins when a word has several translations.
const glossary: [string, string][] = [
  // People
  ['mother', 'nanay'], ['mom', 'nanay'], ['mama', 'mama'], ['father', 'tatay'], ['dad', 'tatay'], ['papa', 'papa'],
  ['grandmother', 'lola'], ['grandma', 'lola'], ['grandfather', 'lolo'], ['grandpa', 'lolo'],
  ['older brother', 'kuya'], ['older sister', 'ate'], ['brother', 'kapatid na lalaki'], ['sister', 'kapatid na babae'],
  ['sibling', 'kapatid'], ['baby', 'sanggol'], ['child', 'bata'], ['children', 'mga bata'], ['friend', 'kaibigan'],
  ['teacher', 'guro'], ['classmate', 'kaklase'], ['doctor', 'doktor'], ['nurse', 'nars'], ['family', 'pamilya'],
  ['aunt', 'tita'], ['uncle', 'tito'], ['cousin', 'pinsan'], ['neighbor', 'kapitbahay'], ['person', 'tao'],
  ['boy', 'batang lalaki'], ['girl', 'batang babae'], ['man', 'lalaki'], ['woman', 'babae'],
  // Food and drink
  ['food', 'pagkain'], ['water', 'tubig'], ['rice', 'kanin'], ['bread', 'tinapay'], ['milk', 'gatas'], ['juice', 'juice'],
  ['egg', 'itlog'], ['chicken', 'manok'], ['fish', 'isda'], ['meat', 'karne'], ['pork', 'baboy'], ['beef', 'baka'],
  ['vegetables', 'gulay'], ['vegetable', 'gulay'], ['fruit', 'prutas'], ['banana', 'saging'], ['mango', 'mangga'],
  ['apple', 'mansanas'], ['orange', 'dalandan'], ['soup', 'sabaw'], ['noodles', 'pansit'], ['candy', 'kendi'],
  ['snack', 'meryenda'], ['breakfast', 'almusal'], ['lunch', 'tanghalian'], ['dinner', 'hapunan'], ['coffee', 'kape'],
  ['salt', 'asin'], ['sugar', 'asukal'], ['ice', 'yelo'], ['spoon', 'kutsara'], ['fork', 'tinidor'], ['plate', 'plato'],
  ['cup', 'baso'], ['glass', 'baso'], ['bottle', 'bote'],
  // Places
  ['home', 'bahay'], ['house', 'bahay'], ['school', 'paaralan'], ['classroom', 'silid-aralan'], ['bathroom', 'banyo'],
  ['toilet', 'kubeta'], ['kitchen', 'kusina'], ['bedroom', 'kuwarto'], ['room', 'kuwarto'], ['church', 'simbahan'],
  ['hospital', 'ospital'], ['clinic', 'klinika'], ['store', 'tindahan'], ['market', 'palengke'], ['park', 'parke'],
  ['outside', 'labas'], ['inside', 'loob'], ['playground', 'palaruan'], ['garden', 'hardin'], ['bed', 'kama'],
  // Things
  ['ball', 'bola'], ['toy', 'laruan'], ['book', 'libro'], ['pencil', 'lapis'], ['pen', 'bolpen'], ['paper', 'papel'],
  ['bag', 'bag'], ['chair', 'upuan'], ['table', 'mesa'], ['door', 'pinto'], ['window', 'bintana'], ['phone', 'telepono'],
  ['television', 'telebisyon'], ['tv', 'tv'], ['clothes', 'damit'], ['shirt', 'damit'], ['shoes', 'sapatos'],
  ['slippers', 'tsinelas'], ['blanket', 'kumot'], ['pillow', 'unan'], ['towel', 'tuwalya'], ['soap', 'sabon'],
  ['toothbrush', 'sipilyo'], ['medicine', 'gamot'], ['money', 'pera'], ['umbrella', 'payong'], ['music', 'musika'],
  ['song', 'kanta'], ['game', 'laro'], ['picture', 'larawan'], ['car', 'kotse'], ['bus', 'bus'], ['jeep', 'dyip'],
  // Body
  ['head', 'ulo'], ['stomach', 'tiyan'], ['tummy', 'tiyan'], ['tooth', 'ngipin'], ['teeth', 'ngipin'], ['eye', 'mata'],
  ['eyes', 'mata'], ['ear', 'tainga'], ['nose', 'ilong'], ['mouth', 'bibig'], ['hand', 'kamay'], ['hands', 'kamay'],
  ['foot', 'paa'], ['feet', 'paa'], ['leg', 'binti'], ['arm', 'braso'], ['back', 'likod'], ['throat', 'lalamunan'],
  // Feelings and states
  ['hungry', 'gutom'], ['thirsty', 'nauuhaw'], ['tired', 'pagod'], ['sleepy', 'inaantok'], ['sick', 'may sakit'],
  ['happy', 'masaya'], ['sad', 'malungkot'], ['angry', 'galit'], ['scared', 'takot'], ['afraid', 'takot'],
  ['excited', 'nasasabik'], ['bored', 'naiinip'], ['hot', 'mainit'], ['cold', 'malamig'], ['okay', 'okay'],
  ['fine', 'mabuti'], ['good', 'mabuti'], ['bad', 'masama'], ['hurt', 'masakit'], ['painful', 'masakit'],
  ['dizzy', 'nahihilo'], ['full', 'busog'], ['wet', 'basa'], ['dirty', 'marumi'], ['clean', 'malinis'],
  ['big', 'malaki'], ['small', 'maliit'], ['beautiful', 'maganda'], ['nice', 'maganda'], ['delicious', 'masarap'],
  ['lonely', 'nalulungkot'], ['worried', 'nag-aalala'], ['confused', 'nalilito'], ['shy', 'nahihiya'],
  // Actions
  ['eat', 'kumain'], ['drink', 'uminom'], ['sleep', 'matulog'], ['rest', 'magpahinga'], ['play', 'maglaro'],
  ['go', 'pumunta'], ['come', 'pumunta'], ['walk', 'maglakad'], ['run', 'tumakbo'], ['sit', 'umupo'], ['stand', 'tumayo'],
  ['read', 'magbasa'], ['write', 'magsulat'], ['draw', 'gumuhit'], ['sing', 'kumanta'], ['dance', 'sumayaw'],
  ['bathe', 'maligo'], ['take a bath', 'maligo'], ['wash', 'maghugas'], ['pee', 'umihi'], ['poop', 'dumumi'],
  ['help', 'tulong'], ['wait', 'maghintay'], ['stop', 'tigil'], ['listen', 'makinig'], ['look', 'tumingin'],
  ['watch', 'manood'], ['call', 'tawagan'], ['open', 'buksan'], ['close', 'isara'], ['give', 'bigyan'],
  ['learn', 'matuto'], ['study', 'mag-aral'], ['pray', 'magdasal'], ['hug', 'yakap'], ['talk', 'makipag-usap'],
  // Time
  ['now', 'ngayon'], ['later', 'mamaya'], ['today', 'ngayong araw'], ['tomorrow', 'bukas'], ['yesterday', 'kahapon'],
  ['morning', 'umaga'], ['afternoon', 'hapon'], ['evening', 'gabi'], ['night', 'gabi'], ['noon', 'tanghali'],
  // Social words
  ['yes', 'oo'], ['no', 'hindi'], ['please', 'pakiusap'], ['thank you', 'salamat'], ['thanks', 'salamat'],
  ['sorry', 'pasensya na'], ['hello', 'kumusta'], ['hi', 'hi'], ['goodbye', 'paalam'], ['bye', 'paalam'],
  ['good morning', 'magandang umaga'], ['good afternoon', 'magandang hapon'], ['good evening', 'magandang gabi'],
  ['good night', 'magandang gabi'], ['i love you', 'mahal kita'], ['more', 'pa'], ['again', 'ulit'],
  ['finished', 'tapos na'], ['done', 'tapos na'], ['all done', 'tapos na'], ['wait for me', 'hintayin mo ako'],
  ['come here', 'halika'], ['let\'s go', 'tara na'], ['excuse me', 'makikiraan po'],
  ['go home', 'umuwi'], ['go to school', 'pumasok sa paaralan'], ['go out', 'lumabas'], ['go to the bathroom', 'pumunta sa banyo'],
  ['take a rest', 'magpahinga'], ['watch tv', 'manood ng tv'], ['ice cream', 'ice cream'],
  // Colours
  ['red', 'pula'], ['blue', 'asul'], ['green', 'berde'], ['yellow', 'dilaw'], ['white', 'puti'], ['black', 'itim'],
  ['pink', 'rosas'], ['brown', 'kayumanggi'],
  // Animals
  ['dog', 'aso'], ['cat', 'pusa'], ['bird', 'ibon'], ['pig', 'baboy'], ['cow', 'baka'], ['horse', 'kabayo'],
];

const englishToFilipino = new Map<string, string>();
const filipinoToEnglish = new Map<string, string>();
for (const [english, filipino] of glossary) {
  if (!englishToFilipino.has(english)) englishToFilipino.set(english, filipino);
  if (!filipinoToEnglish.has(filipino)) filipinoToEnglish.set(filipino, english);
}

// Simple sentence frames common on communication boards. {x} must itself be translatable.
// keepUnknown: an unknown word there is usually a thing or a name (food, place, brand, person), which
// Filipinos keep as it is ("Gusto ko ng ice cream"), so it is kept instead of giving up.
const sentencePatterns: {
  en: RegExp; fil: RegExp; toEn: (x: string) => string; toFil: (x: string) => string; keepUnknown: boolean;
}[] = [
  { en: /^i want to (.+)$/, fil: /^gusto kong (.+)$/, toEn: (x) => `I want to ${x}`, toFil: (x) => `Gusto kong ${x}`, keepUnknown: false },
  { en: /^i want (?:a |an |the |some |my )?(.+)$/, fil: /^gusto ko (?:ng |ang )?(.+)$/, toEn: (x) => `I want ${x}`, toFil: (x) => `Gusto ko ng ${x}`, keepUnknown: true },
  { en: /^i need to (.+)$/, fil: /^kailangan kong (.+)$/, toEn: (x) => `I need to ${x}`, toFil: (x) => `Kailangan kong ${x}`, keepUnknown: false },
  { en: /^i need (?:a |an |the |some |my )?(.+)$/, fil: /^kailangan ko (?:ng |ang )?(.+)$/, toEn: (x) => `I need ${x}`, toFil: (x) => `Kailangan ko ng ${x}`, keepUnknown: true },
  { en: /^i don'?t want (?:a |an |the |some |my )?(.+)$/, fil: /^ayoko (?:ng |ang )?(.+)$/, toEn: (x) => `I don't want ${x}`, toFil: (x) => `Ayoko ng ${x}`, keepUnknown: true },
  { en: /^i like (?:a |an |the )?(.+)$/, fil: /^gusto ko ang (.+)$/, toEn: (x) => `I like ${x}`, toFil: (x) => `Gusto ko ang ${x}`, keepUnknown: true },
  { en: /^can i (.+)$/, fil: /^pwede ba akong (.+)$/, toEn: (x) => `Can I ${x}`, toFil: (x) => `Pwede ba akong ${x}`, keepUnknown: false },
  { en: /^let'?s (.+)$/, fil: /^tara,? (.+) tayo$/, toEn: (x) => `Let's ${x}`, toFil: (x) => `Tara, ${x} tayo`, keepUnknown: false },
  { en: /^where is (?:my |the )?(.+)$/, fil: /^nasaan (?:ang |si )?(.+)$/, toEn: (x) => `Where is ${x}`, toFil: (x) => `Nasaan ang ${x}`, keepUnknown: true },
  { en: /^my (.+) hurts$/, fil: /^masakit ang (.+) ko$/, toEn: (x) => `My ${x} hurts`, toFil: (x) => `Masakit ang ${x} ko`, keepUnknown: true },
  { en: /^i am (.+)$/, fil: /^(.+) ako$/, toEn: (x) => `I am ${x}`, toFil: (x) => `${x} ako`, keepUnknown: false },
  { en: /^i'?m (.+)$/, fil: /^(.+) ako$/, toEn: (x) => `I am ${x}`, toFil: (x) => `${x} ako`, keepUnknown: false },
];

function normalize(text: string): string {
  return text.toLocaleLowerCase().replace(/[.!?,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

// Keeps the original ending punctuation (".", "!" or "?").
function withEnding(original: string, translated: string): string {
  const ending = original.trim().match(/[.!?]+$/)?.[0] ?? '';
  return capitalize(translated.replace(/[.!?]+$/, '')) + ending;
}

function buildPhraseMap(source: PhraseSource, from: TranslationLanguage, to: TranslationLanguage): Map<string, string> {
  const map = new Map<string, string>();
  const targets = new Map(source[to].messages.map((message) => [message.uuid, message]));
  for (const message of source[from].messages) {
    const target = targets.get(message.uuid);
    if (!target) continue;
    if (message.message_text && target.message_text) map.set(normalize(message.message_text), target.message_text);
    if (message.title && target.title && !map.has(normalize(message.title))) map.set(normalize(message.title), target.title);
  }
  return map;
}

function translateTerm(term: string, dictionary: Map<string, string>): string | null {
  const exact = dictionary.get(term);
  if (exact) return exact;
  // Every word must be known, otherwise the result would be half translated.
  const words = term.split(' ');
  const translatedWords = words.map((word) => dictionary.get(word));
  return translatedWords.every(Boolean) && words.length <= 3 ? translatedWords.join(' ') : null;
}

// Only short things or names are kept as they are ("ice cream", "Jollibee"); a longer unknown part is a
// sentence, which is left to the on-device translator instead.
function isLikelyName(part: string): boolean {
  return part.split(' ').length <= 3 && !/^(to|and|but|because|if|when)\b/.test(part);
}

// The kept word as the person typed it (keeps capitals of names like "Jollibee").
function originalSpelling(text: string, normalizedWord: string): string {
  const index = text.toLocaleLowerCase().indexOf(normalizedWord);
  return index >= 0 ? text.slice(index, index + normalizedWord.length) : normalizedWord;
}

export function createTranslator(source: PhraseSource) {
  const phraseMaps = {
    'en>fil': buildPhraseMap(source, 'en', 'fil'),
    'fil>en': buildPhraseMap(source, 'fil', 'en'),
  };

  return (text: string, from: TranslationLanguage, to: TranslationLanguage): string | null => {
    if (from === to) return text;
    const key = from === 'en' ? 'en>fil' : 'fil>en';
    const normalized = normalize(text);
    if (!normalized) return null;

    const phrase = phraseMaps[key].get(normalized);
    if (phrase) return phrase;

    const dictionary = from === 'en' ? englishToFilipino : filipinoToEnglish;
    const term = translateTerm(normalized, dictionary);
    if (term) return withEnding(text, term);

    for (const pattern of sentencePatterns) {
      const match = normalized.match(from === 'en' ? pattern.en : pattern.fil);
      const translatedPart = match
        ? translateTerm(match[1], dictionary) ?? (pattern.keepUnknown && isLikelyName(match[1]) ? originalSpelling(text, match[1]) : null)
        : null;
      if (translatedPart) return withEnding(text, from === 'en' ? pattern.toFil(translatedPart) : pattern.toEn(translatedPart));
    }

    return null;
  };
}
