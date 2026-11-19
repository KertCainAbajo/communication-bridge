import { StatusBar } from 'expo-status-bar';
import { useAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import Storage from 'expo-sqlite/kv-store';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import bundledContent from './assets/offline/content.json';
import bisayaPhraseWords from './assets/offline/bisaya-words.json';
import { offlineSpeech } from './offlineSpeech';
import { createTranslator } from './translation';
import { normalizeSpeechKey, prepareForEnglishVoice } from './speechText';
import { checkBuiltInVoiceHealth, synthesizeWithBuiltInVoice } from './builtInVoice';

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '');
const apiV1Url = `${apiBaseUrl}/v1`;
const customWordsStorageKey = 'communication-bridge.custom-words.v1';
const customCategoriesStorageKey = 'communication-bridge.custom-categories.v1';
const hiddenMessagesStorageKey = 'communication-bridge.hidden-messages.v1';
const offlineContentStorageKey = 'communication-bridge.offline-content.v1';
// Which voice reads Filipino and Bisaya: the phone's own Google voice (natural) or the built-in one.
const filipinoVoiceStorageKey = 'communication-bridge.filipino-voice.v1';
type FilipinoVoiceChoice = 'phone' | 'builtin';
const customCategoryPrefix = 'custom:';

type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  messages_count: number;
};

type CommunicationMessage = {
  uuid: string;
  slug: string;
  title: string | null;
  message_text: string | null;
  icon: string | null;
  is_emergency: boolean;
  is_featured: boolean;
  category: Category;
};

type LanguageCode = 'en' | 'fil';
// Voices for speech. Bisaya has its own voice but no board language of its own.
type SpeechVoice = LanguageCode | 'ceb';

type OfflineContent = {
  generated_at: string;
  languages: Record<LanguageCode, { categories: Category[]; messages: CommunicationMessage[] }>;
};

type CustomWord = {
  id: string;
  // The text as typed and its language. Older saved words only have these.
  text: string;
  language: string;
  categoryId?: string;
  // The word in each language, filled in automatically and editable before saving.
  texts?: Partial<Record<LanguageCode, string>>;
  needsTranslationCheck?: boolean;
};

type CustomCategory = {
  id: string;
  name: string;
};

const languages = [
  { code: 'en', label: 'English', voice: 'en-US' },
  { code: 'fil', label: 'Filipino', voice: 'fil-PH' },
] as const;

// Phone voice locales in order of preference. Phones have no Bisaya voice, so Bisaya falls back to Filipino.
const speechLanguageAliases: Record<SpeechVoice, string[]> = {
  en: ['en-us', 'en'],
  fil: ['fil-ph', 'fil', 'tl'],
  ceb: ['ceb', 'fil-ph', 'fil', 'tl'],
};

const voiceLabels: Record<SpeechVoice, string> = { en: 'English', fil: 'Filipino', ceb: 'Bisaya' };

// Indonesian voices read Filipino and Bisaya spelling with nearly the right sounds.
const indonesianVoiceAliases = ['id-id', 'id', 'in-id', 'in'];

const initialContent = bundledContent as unknown as OfflineContent;

const commonFilipinoWords = [
  'ako', 'ikaw', 'ka', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ko', 'mo', 'niya', 'natin', 'namin', 'nila', 'akin', 'iyo',
  'ang', 'ng', 'mga', 'sa', 'si', 'ni', 'kay', 'na', 'at', 'pa', 'po', 'opo', 'oo', 'hindi', 'huwag', 'wala', 'may', 'mayroon',
  'gusto', 'ayaw', 'kailangan', 'pwede', 'puwede', 'salamat', 'ito', 'iyan', 'iyon', 'dito', 'diyan', 'doon', 'ano', 'sino',
  'saan', 'kailan', 'bakit', 'paano', 'ilan', 'magkano', 'lang', 'din', 'rin', 'naman', 'talaga', 'kasi', 'pero', 'kung',
  'gutom', 'uhaw', 'pagod', 'masakit', 'tulong', 'tulungan', 'kain', 'kumain', 'inom', 'uminom', 'tubig', 'banyo', 'bahay',
  'masaya', 'malungkot', 'galit', 'takot', 'mahal', 'kita', 'tayo', 'nanay', 'tatay', 'kuya', 'ate', 'magandang', 'umaga',
  'hapon', 'gabi', 'paalam', 'ulit', 'sige', 'tara', 'ba', 'nga', 'yung', 'yan', 'dun', 'ganito', 'ganyan',
];

const commonBisayaWords = [
  'ako', 'ko', 'akong', 'nako', 'ikaw', 'ka', 'nimo', 'imong', 'siya', 'niya', 'iyang', 'kami', 'mi', 'kita', 'ta', 'kamo',
  'mo', 'sila', 'nila', 'ilang', 'ang', 'sa', 'og', 'ug', 'nga', 'mga', 'si', 'ni', 'kang', 'dili', 'ayaw', 'wala', 'naa',
  'aduna', 'adunay', 'gusto', 'ganahan', 'kinahanglan', 'palihug', 'salamat', 'unsa', 'asa', 'diin', 'kanus-a', 'ngano',
  'giunsa', 'unsaon', 'pila', 'kinsa', 'kini', 'kana', 'kadto', 'diri', 'dinhi', 'diha', 'didto', 'karon', 'unya', 'ugma',
  'gahapon', 'ra', 'lang', 'pud', 'sad', 'sab', 'man', 'bitaw', 'jud', 'gyud', 'kay', 'apan', 'pero', 'kung', 'ba', 'na',
  'pa', 'gigutom', 'giuhaw', 'kapoy', 'sakit', 'masakit', 'nagsakit', 'tabang', 'tabangi', 'kaon', 'mokaon', 'inom',
  'moinom', 'tubig', 'kan-on', 'pagkaon', 'kasilyas', 'balay', 'eskwelahan', 'malipayon', 'nalipay', 'masulub-on',
  'masulob-on', 'naguol', 'nasuko', 'nahadlok', 'maayong', 'buntag', 'udto', 'hapon', 'gabii', 'amping', 'babay', 'oo',
  'mama', 'papa', 'lola', 'lolo', 'igsoon', 'manghod', 'magulang', 'amigo', 'higala', 'maestra', 'magtutudlo', 'tulog',
  'matulog', 'katulog', 'dula', 'magdula', 'adto', 'moadto', 'mouli', 'uli', 'gawas', 'mogawas', 'sulod', 'hulat',
  'paghulat', 'tan-aw', 'paminaw', 'storya', 'istorya', 'kabalo', 'kasabot', 'wa', 'di', 'nimo', 'kog', 'koy', 'kaayo',
];

const commonEnglishWords = [
  'i', 'me', 'my', 'you', 'your', 'he', 'she', 'we', 'they', 'it', 'is', 'am', 'are', 'was', 'were', 'be', 'the', 'a', 'an',
  'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'want', 'need', 'like', 'please', 'thank', 'thanks',
  'yes', 'no', 'not', 'do', 'does', "don't", 'can', "can't", 'will', 'have', 'has', 'what', 'where', 'when', 'why', 'how',
  'who', 'this', 'that', 'here', 'there', 'go', 'eat', 'drink', 'water', 'hungry', 'thirsty', 'tired', 'help', 'bathroom',
  'home', 'happy', 'sad', 'angry', 'scared', 'love', 'hello', 'hi', 'good', 'morning', 'afternoon', 'night', 'bye', 'sorry',
];

function wordsOf(text: string): string[] {
  return text.toLocaleLowerCase().match(/[a-zñ']+/g) ?? [];
}

// Builds word lists from the app's own phrases plus common words.
// "local" holds Filipino and Bisaya words together (to tell them apart from English);
// "fil" and "ceb" keep only words that belong to one of the two, to tell Filipino from Bisaya.
function buildLanguageVocabulary(content: OfflineContent) {
  const phraseWords = (code: LanguageCode) => content.languages[code].messages
    .flatMap((message) => wordsOf(`${message.title ?? ''} ${message.message_text ?? ''}`));
  const english = new Set([...commonEnglishWords, ...phraseWords('en')]);
  const filipino = new Set([...commonFilipinoWords, ...phraseWords('fil')]);
  const bisaya = new Set([...commonBisayaWords, ...(bisayaPhraseWords as string[])]);
  const local = new Set([...filipino, ...bisaya]);
  // Loanwords and names used in both English and the local languages say nothing about the language.
  [...english].filter((word) => local.has(word)).forEach((word) => {
    english.delete(word); local.delete(word); filipino.delete(word); bisaya.delete(word);
  });
  [...filipino].filter((word) => bisaya.has(word)).forEach((word) => { filipino.delete(word); bisaya.delete(word); });
  return { en: english, local, fil: filipino, ceb: bisaya };
}

const languageVocabulary = buildLanguageVocabulary(initialContent);
const translateText = createTranslator(initialContent.languages);

function otherLanguage(code: LanguageCode): LanguageCode {
  return code === 'en' ? 'fil' : 'en';
}

// The word's text in a language, or undefined if it has none (older words were saved in one language only).
function wordTextIn(word: CustomWord, code: LanguageCode): string | undefined {
  const text = word.texts?.[code] ?? (word.language === code ? word.text : undefined);
  return text?.trim() ? text : undefined;
}

// Letters and pairs common in English spelling but rare in Filipino and Bisaya.
const englishSpellingPattern = /[cfqvxz]|th|sh|ch|ph|wh|ck|ee|ght|tion/;

// Decides offline which voice should read typed text: English, Filipino or Bisaya.
function detectSpeechVoice(text: string, fallback: LanguageCode): SpeechVoice {
  const words = wordsOf(text);
  const count = (set: Set<string>) => words.filter((word) => set.has(word)).length;
  const englishScore = count(languageVocabulary.en);
  const localScore = count(languageVocabulary.local);

  let isLocal: boolean;
  if (localScore !== englishScore) {
    isLocal = localScore > englishScore;
  } else {
    // Unknown words (e.g. names or rare words): guess from spelling.
    const unknownWords = words.filter((word) => !languageVocabulary.local.has(word) && !languageVocabulary.en.has(word));
    const englishLooking = unknownWords.filter((word) => englishSpellingPattern.test(word)).length;
    const localLooking = unknownWords.length - englishLooking;
    if (localLooking === englishLooking) return fallback;
    isLocal = localLooking > englishLooking;
  }
  if (!isLocal) return 'en';

  const bisayaScore = count(languageVocabulary.ceb);
  const filipinoScore = count(languageVocabulary.fil);
  return bisayaScore > filipinoScore ? 'ceb' : 'fil';
}

// The board language for typed text. Bisaya words are saved as Filipino text.
function detectTextLanguage(text: string, fallback: LanguageCode): LanguageCode {
  return detectSpeechVoice(text, fallback) === 'en' ? 'en' : 'fil';
}

async function readStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  return Storage.getItem(key);
}

async function writeStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(key, value);
    return;
  }
  await Storage.setItem(key, value);
}

function isOfflineContent(value: unknown): value is OfflineContent {
  const content = value as OfflineContent | null;
  return Boolean(content?.generated_at && content.languages
    && (['en', 'fil'] as const).every((code) => Array.isArray(content.languages[code]?.messages)));
}

function normalizeVoiceLocale(locale: string): string {
  return locale.toLocaleLowerCase().replaceAll('_', '-');
}

function findDeviceVoice(voices: Speech.Voice[], aliases: string[]): Speech.Voice | undefined {
  for (const alias of aliases) {
    const matches = voices.filter((voice) => {
      const locale = normalizeVoiceLocale(voice.language);
      return locale === alias || locale.startsWith(`${alias}-`);
    });
    // Prefer voices that are installed on the phone (no internet needed).
    const installed = matches.find((voice) => !/network/i.test(voice.identifier));
    if (installed ?? matches[0]) return installed ?? matches[0];
  }
  return undefined;
}

const icons: Record<string, string> = {
  food: '🍽️', eating: '🥣', snack: '🍎', rice: '🍚', meal: '🍲', drink: '🥤', water: '💧',
  milk: '🥛', juice: '🧃', bathroom: '🚻', 'hand-wash': '🧼', tired: '😴', rest: '🛏️',
  unwell: '🤒', home: '🏠', question: '❓', confused: '🤔', repeat: '🔁', help: '🙋',
  answer: '✋', participate: '🙋‍♀️', outside: '🚪', time: '⏰', break: '☕', finished: '✅',
  happy: '😊', sad: '😢', angry: '😠', scared: '😨', excited: '🤩', frustrated: '😣',
  worried: '😟', uncomfortable: '🙁', lonely: '🫂', calm: '😌', comfort: '💛', alone: '🧍',
  hello: '👋', morning: '🌅', afternoon: '☀️', evening: '🌙', 'thank-you': '🙏', welcome: '🤝',
  goodbye: '👋', play: '🧸', 'play-together': '⚽', friend: '🤝', like: '👍', dislike: '👎',
  yes: '✅', no: '❌', please: '🙏', emergency: '🆘', pain: '🩹', sick: '🤢', teacher: '🧑‍🏫',
  parents: '👨‍👩‍👧', safe: '🛡️', warning: '⚠️',
};

function getIcon(icon: string | null, emergency: boolean): string {
  if (emergency) return icons[icon ?? ''] ?? '🆘';
  return icons[icon ?? ''] ?? '💬';
}

async function downloadContent(): Promise<OfflineContent> {
  const results = await Promise.all(languages.map(async ({ code }) => {
    const [categoryResponse, messageResponse] = await Promise.all([
      getApiData<Category[]>(`${apiV1Url}/categories?language=${code}`),
      getApiData<CommunicationMessage[]>(`${apiV1Url}/messages?language=${code}&per_page=100`),
    ]);
    return [code, { categories: categoryResponse.data, messages: messageResponse.data }] as const;
  }));

  return {
    generated_at: new Date().toISOString(),
    languages: Object.fromEntries(results) as OfflineContent['languages'],
  };
}

async function getApiData<T>(url: string): Promise<ApiResponse<T>> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const result = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !result.success) {
    throw new Error(result.message || `Request failed (${response.status})`);
  }

  return result;
}

export default function App() {
  const { width } = useWindowDimensions();
  const [language, setLanguage] = useState<(typeof languages)[number]['code']>('en');
  const [content, setContent] = useState<OfflineContent>(initialContent);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [lastSpoken, setLastSpoken] = useState('');
  const [speechDraft, setSpeechDraft] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  // The phone's Google voice sounds natural like English; the built-in voice works on every phone.
  const [filipinoVoice, setFilipinoVoice] = useState<FilipinoVoiceChoice>('phone');

  useEffect(() => {
    void readStoredValue(filipinoVoiceStorageKey).then((value) => {
      if (value === 'builtin') setFilipinoVoice('builtin');
    }).catch(() => undefined);
  }, []);

  const chooseFilipinoVoice = (choice: FilipinoVoiceChoice) => {
    setFilipinoVoice(choice);
    void writeStoredValue(filipinoVoiceStorageKey, choice).catch(() => undefined);
  };

  const [speechLoading, setSpeechLoading] = useState(false);
  const speechPlayer = useAudioPlayer(null, { downloadFirst: true });
  const [customWords, setCustomWords] = useState<CustomWord[]>([]);
  const [pendingWords, setPendingWords] = useState<CustomWord[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [customCategoryError, setCustomCategoryError] = useState<string | null>(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [lastRemovedMessage, setLastRemovedMessage] = useState<CommunicationMessage | null>(null);
  const [localActionError, setLocalActionError] = useState<string | null>(null);
  const [customWordInput, setCustomWordInput] = useState('');
  const [customWordError, setCustomWordError] = useState<string | null>(null);
  const [customWordsReady, setCustomWordsReady] = useState(false);

  // Records whether the built-in voice crashed last time, so it can be switched off safely.
  useEffect(() => {
    void checkBuiltInVoiceHealth().catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;

    const loadCustomWords = async () => {
      try {
        const [storedWords, storedCategories, storedHiddenMessages] = Platform.OS === 'web'
          ? (typeof window === 'undefined'
            ? [null, null, null]
            : [
              window.localStorage.getItem(customWordsStorageKey),
              window.localStorage.getItem(customCategoriesStorageKey),
              window.localStorage.getItem(hiddenMessagesStorageKey),
            ])
          : await Promise.all([
            Storage.getItem(customWordsStorageKey),
            Storage.getItem(customCategoriesStorageKey),
            Storage.getItem(hiddenMessagesStorageKey),
          ]);
        if (active && storedWords) {
          const parsedWords = JSON.parse(storedWords) as CustomWord[];
          if (Array.isArray(parsedWords)) setCustomWords(parsedWords);
        }
        if (active && storedCategories) {
          const parsedCategories = JSON.parse(storedCategories) as CustomCategory[];
          if (Array.isArray(parsedCategories)) setCustomCategories(parsedCategories);
        }
        if (active && storedHiddenMessages) {
          const parsedIds = JSON.parse(storedHiddenMessages) as string[];
          if (Array.isArray(parsedIds)) setHiddenMessageIds(parsedIds);
        }
      } catch {
        if (active) setCustomWordError('Saved words could not be loaded on this device.');
      } finally {
        if (active) setCustomWordsReady(true);
      }
    };

    void loadCustomWords();
    return () => { active = false; };
  }, []);

  // Phrases always come from the phone: bundled with the app, or saved from the last update.
  // When there is internet, newer phrases are downloaded and saved for offline use.
  useEffect(() => {
    let active = true;

    const loadContent = async () => {
      try {
        const storedContent = await readStoredValue(offlineContentStorageKey);
        const parsedContent: unknown = storedContent ? JSON.parse(storedContent) : null;
        if (active && isOfflineContent(parsedContent) && parsedContent.generated_at > initialContent.generated_at) {
          setContent(parsedContent);
        }
      } catch {
        // The phrases bundled with the app are still shown.
      }

      try {
        const downloadedContent = await downloadContent();
        if (!active) return;
        setContent(downloadedContent);
        await writeStoredValue(offlineContentStorageKey, JSON.stringify(downloadedContent));
      } catch {
        // No internet: keep using the phrases on the phone.
      }
    };

    void loadContent();
    return () => { active = false; };
  }, []);

  const refreshContent = async () => {
    setSyncing(true);
    try {
      const downloadedContent = await downloadContent();
      setContent(downloadedContent);
      await writeStoredValue(offlineContentStorageKey, JSON.stringify(downloadedContent));
      setSyncNotice('Phrases updated.');
    } catch {
      setSyncNotice('No internet. Showing the phrases saved on this phone.');
    } finally {
      setSyncing(false);
    }
  };

  const categories = useMemo(() => content.languages[language]?.categories ?? [], [content, language]);
  const messages = useMemo(() => {
    const languageMessages = content.languages[language]?.messages ?? [];
    if (!selectedCategory || selectedCategory.startsWith(customCategoryPrefix)) return languageMessages;
    return languageMessages.filter((message) => message.category.slug === selectedCategory);
  }, [content, language, selectedCategory]);

  const visibleMessages = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const customCategorySelected = selectedCategory?.startsWith(customCategoryPrefix) ?? false;
    const availableMessages = customCategorySelected
      ? []
      : messages.filter((message) => !hiddenMessageIds.includes(message.uuid));
    const localWordMessages: CommunicationMessage[] = customWords
      .filter((word) => wordTextIn(word, language) && (!selectedCategory || word.categoryId === selectedCategory))
      .map((word) => {
        const localCategory = categories.find((category) => category.slug === word.categoryId);
        const addedCategory = customCategories.find((category) => category.id === word.categoryId);
        const categoryName = localCategory?.name ?? addedCategory?.name ?? 'Your words';

        return {
          uuid: `custom:${word.id}`,
          slug: `custom-${word.id}`,
          title: wordTextIn(word, language) ?? word.text,
          message_text: wordTextIn(word, language) ?? word.text,
          icon: 'hello',
          is_emergency: false,
          is_featured: false,
          category: {
            id: word.categoryId ?? 'my-words',
            name: categoryName,
            slug: word.categoryId ?? 'my-words',
            color: null,
            icon: null,
            messages_count: 0,
          },
        };
      });
    const combinedMessages = [...availableMessages, ...localWordMessages];
    if (!normalizedSearch) return combinedMessages;

    return combinedMessages.filter((message) =>
      `${message.title ?? ''} ${message.message_text ?? ''}`.toLocaleLowerCase().includes(normalizedSearch),
    );
  }, [messages, search, hiddenMessageIds, customWords, customCategories, categories, language, selectedCategory]);

  const speakWithDeviceVoice = async (text: string, aliases: string[]): Promise<boolean> => {
    const voices = await Speech.getAvailableVoicesAsync();
    const voice = findDeviceVoice(voices, aliases);
    if (!voice) return false;

    await Speech.stop();
    Speech.speak(text, {
      language: voice.language,
      voice: voice.identifier,
      rate: 0.88,
      pitch: 1.02,
      onError: () => setSpeechError('The phone voice could not speak this text.'),
    });
    return true;
  };

  // Fully offline: audio bundled in the app, otherwise the phone's own installed voice.
  const speakText = async (phrase: string, requestedVoice: SpeechVoice = language) => {
    const text = phrase.trim();
    if (!text) return;

    // Filipino-board words that are really Bisaya (e.g. added by a user) use the Bisaya voice.
    const languageCode: SpeechVoice = requestedVoice === 'fil' && detectSpeechVoice(text, 'fil') === 'ceb'
      ? 'ceb'
      : requestedVoice;
    const selectedLanguage = { label: voiceLabels[languageCode] };
    setSpeechError(null);
    setLastSpoken(text);

    // Natural recordings made with Google's voice (scripts/generate-natural-audio.mjs) come first.
    const speechKey = normalizeSpeechKey(text);
    const bundledAudio = offlineSpeech[`${languageCode}:${speechKey}`]
      ?? (languageCode === 'ceb' ? offlineSpeech[`fil:${speechKey}`] : undefined);
    if (bundledAudio !== undefined) {
      await Speech.stop();
      speechPlayer.replace(bundledAudio);
      speechPlayer.play();
      return;
    }

    setSpeechLoading(true);
    try {
      speechPlayer.pause();
      if (languageCode !== 'en' && filipinoVoice === 'phone' && Platform.OS === 'android') {
        // The phone's Google Filipino voice: natural like the English voice. Bisaya is read with it too.
        const voices = await Speech.getAvailableVoicesAsync();
        const filipinoVoices = voices.filter((voice) => /^(fil|tl)([-_]|$)/i.test(voice.language));
        console.log('[voice] phone Filipino voices:', filipinoVoices.map((voice) => voice.identifier).join(', ') || 'none');
        if (await speakWithDeviceVoice(text, speechLanguageAliases.fil)) return;
      }
      if (languageCode !== 'en' && Platform.OS === 'android') {
        // Clear voice: Google's Indonesian voice reads Filipino and Bisaya with nearly the right sounds
        // (Indonesian uses the same spelling rules: a e i o u, hard g, ng). Without it, the English voice.
        const spokenText = prepareForEnglishVoice(text, languageCode);
        const voices = await Speech.getAvailableVoicesAsync();
        console.log('[voice] phone Indonesian voices:', voices.filter((voice) => /^id([-_]|$)/i.test(voice.language)).map((voice) => voice.identifier).join(', ') || 'none');
        if (await speakWithDeviceVoice(spokenText, indonesianVoiceAliases)) return;
        if (await speakWithDeviceVoice(spokenText, speechLanguageAliases.en)) return;
      }
      if (languageCode !== 'en') {
        // Last resort, for phones with no English voice: the voice inside the app.
        const builtInAudio = await synthesizeWithBuiltInVoice(text, languageCode, { clearSpeech: true }).catch((error: unknown) => {
          console.log('[voice] error', String(error));
          return null;
        });
        if (builtInAudio) {
          console.log('[voice] playing', builtInAudio);
          await Speech.stop();
          speechPlayer.replace({ uri: builtInAudio });
          speechPlayer.play();
          return;
        }
      }
      if (await speakWithDeviceVoice(text, speechLanguageAliases[languageCode])) return;

      setSpeechError(Platform.OS === 'web'
        ? `This browser has no ${selectedLanguage.label} voice (computers usually lack one). Test ${selectedLanguage.label} speech on an Android phone.`
        : languageCode === 'en'
          ? 'No English voice is installed on this phone. Install one in Settings › Text-to-speech.'
          : `No ${selectedLanguage.label} voice is available offline on this phone. Open Settings › Text-to-speech › Google › Install voice data, and download Filipino. It then works without internet.`);
    } catch {
      setSpeechError(`Could not speak this ${selectedLanguage.label} text on this phone.`);
    } finally {
      setSpeechLoading(false);
    }
  };

  const speak = (message: CommunicationMessage) => {
    const phrase = message.message_text?.trim();
    if (!phrase) return;

    speakText(phrase);
  };

  const speakDraft = () => {
    const phrase = speechDraft.trim();
    if (phrase) speakText(phrase, detectSpeechVoice(phrase, language));
  };

  const addPendingWord = () => {
    const text = customWordInput.trim();
    if (!selectedCategory) {
      setCustomWordError('Choose a category before adding a word.');
      return;
    }
    if (!text) {
      setCustomWordError('Type a word or phrase first.');
      return;
    }

    const sourceLanguage = detectTextLanguage(text, language);
    const targetLanguage = otherLanguage(sourceLanguage);
    const isDuplicate = [...customWords, ...pendingWords].some((word) =>
      word.categoryId === selectedCategory
      && wordTextIn(word, sourceLanguage)?.toLocaleLowerCase() === text.toLocaleLowerCase()
    );
    if (isDuplicate) {
      setCustomWordError('That word is already added in this category.');
      return;
    }

    // Names and food (e.g. "Adobo") usually stay the same, so unknown words are copied and flagged for a check.
    const translated = translateText(text, sourceLanguage, targetLanguage);
    const word: CustomWord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      language: sourceLanguage,
      categoryId: selectedCategory,
      texts: { [sourceLanguage]: text, [targetLanguage]: translated ?? text },
      needsTranslationCheck: translated === null,
    };
    setPendingWords((words) => [...words, word]);
    setCustomWordInput('');
    setCustomWordError(null);
  };

  const updatePendingTranslation = (id: string, code: LanguageCode, value: string) => {
    setPendingWords((words) => words.map((word) =>
      word.id === id ? { ...word, texts: { ...word.texts, [code]: value }, needsTranslationCheck: false } : word));
  };

  const saveCustomWord = async (pendingWord: CustomWord) => {
    const englishText = wordTextIn(pendingWord, 'en')?.trim();
    const filipinoText = wordTextIn(pendingWord, 'fil')?.trim();
    if (!englishText || !filipinoText) {
      setCustomWordError('Type the word in both English and Filipino before saving.');
      return;
    }
    const word: CustomWord = {
      id: pendingWord.id,
      text: pendingWord.text,
      language: pendingWord.language,
      categoryId: pendingWord.categoryId,
      texts: { en: englishText, fil: filipinoText },
    };
    const updatedWords = [...customWords, word];

    try {
      if (Platform.OS === 'web') {
        window.localStorage.setItem(customWordsStorageKey, JSON.stringify(updatedWords));
      } else {
        await Storage.setItem(customWordsStorageKey, JSON.stringify(updatedWords));
      }
      setCustomWords(updatedWords);
      setPendingWords((words) => words.filter((pendingWord) => pendingWord.id !== word.id));
      if (word.categoryId) setSelectedCategory(word.categoryId);
      setCustomWordError(null);
    } catch {
      setCustomWordError('Could not save this word on the device. Try again.');
    }
  };

  const discardPendingWord = (id: string) => {
    setPendingWords((words) => words.filter((word) => word.id !== id));
    setCustomWordError(null);
  };

  const removeCustomWord = async (id: string) => {
    const updatedWords = customWords.filter((word) => word.id !== id);

    try {
      if (Platform.OS === 'web') {
        window.localStorage.setItem(customWordsStorageKey, JSON.stringify(updatedWords));
      } else {
        await Storage.setItem(customWordsStorageKey, JSON.stringify(updatedWords));
      }
      setCustomWords(updatedWords);
      setCustomWordError(null);
    } catch {
      setCustomWordError('Could not remove this word from the device. Try again.');
    }
  };

  const saveCustomCategory = async () => {
    const name = customCategoryInput.trim();
    if (!name) {
      setCustomCategoryError('Type a category name first.');
      return;
    }

    const duplicate = [...categories.map((category) => category.name), ...customCategories.map((category) => category.name)]
      .some((existingName) => existingName.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      setCustomCategoryError('A category with that name already exists.');
      return;
    }

    const category: CustomCategory = {
      id: `${customCategoryPrefix}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
    };
    const updatedCategories = [...customCategories, category];

    try {
      if (Platform.OS === 'web') {
        window.localStorage.setItem(customCategoriesStorageKey, JSON.stringify(updatedCategories));
      } else {
        await Storage.setItem(customCategoriesStorageKey, JSON.stringify(updatedCategories));
      }
      setCustomCategories(updatedCategories);
      setCustomCategoryInput('');
      setCustomCategoryError(null);
      setShowCategoryInput(false);
      setSelectedCategory(category.id);
    } catch {
      setCustomCategoryError('Could not save this category on the device. Try again.');
    }
  };

  const hideMessage = async (message: CommunicationMessage) => {
    const updatedIds = [...new Set([...hiddenMessageIds, message.uuid])];

    try {
      const value = JSON.stringify(updatedIds);
      if (Platform.OS === 'web') {
        window.localStorage.setItem(hiddenMessagesStorageKey, value);
      } else {
        await Storage.setItem(hiddenMessagesStorageKey, value);
      }
      setHiddenMessageIds(updatedIds);
      setLastRemovedMessage(message);
      setLocalActionError(null);
    } catch {
      setLocalActionError('Could not remove that message from this device.');
    }
  };

  const undoHideMessage = async () => {
    if (!lastRemovedMessage) return;

    const updatedIds = hiddenMessageIds.filter((id) => id !== lastRemovedMessage.uuid);
    try {
      const value = JSON.stringify(updatedIds);
      if (Platform.OS === 'web') {
        window.localStorage.setItem(hiddenMessagesStorageKey, value);
      } else {
        await Storage.setItem(hiddenMessagesStorageKey, value);
      }
      setHiddenMessageIds(updatedIds);
      setLastRemovedMessage(null);
      setLocalActionError(null);
    } catch {
      setLocalActionError('Could not restore that message on this device.');
    }
  };

  const savedWordsForLanguage = customWords.filter((word) =>
    wordTextIn(word, language) && (!selectedCategory || word.categoryId === selectedCategory)
  );
  const pendingWordsForLanguage = pendingWords.filter((word) =>
    !selectedCategory || word.categoryId === selectedCategory
  );
  const selectedLanguageLabel = languages.find((item) => item.code === language)?.label ?? 'English';
  const draftLanguageLabel = voiceLabels[detectSpeechVoice(speechDraft, language)];
  const selectedCategoryName = selectedCategory?.startsWith(customCategoryPrefix)
    ? customCategories.find((category) => category.id === selectedCategory)?.name ?? 'Custom category'
    : categories.find((category) => category.slug === selectedCategory)?.name ?? null;

  const columnWidth = width >= 900 ? '31%' : '48%';

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>CB</Text></View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>COMMUNICATION BRIDGE</Text>
            <Text style={styles.title}>What would you like to say?</Text>
          </View>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Ready</Text>
          </View>
        </View>

        <View style={styles.speechComposer}>
          <View style={styles.customHeader}>
            <View style={styles.customHeaderCopy}>
              <Text style={styles.customTitle}>Speak anything</Text>
              <Text style={styles.customSubtitle}>Type a word, sentence, or paragraph</Text>
            </View>
            <Text style={styles.customHeaderIcon}>🔊</Text>
          </View>
          <TextInput
            accessibilityLabel="Type text to speak"
            multiline
            maxLength={1000}
            placeholder="Type what you want to say…"
            placeholderTextColor="#8b96a8"
            value={speechDraft}
            onChangeText={setSpeechDraft}
            style={styles.speechTextInput}
          />
          <Text style={styles.speechPrivacyNote}>
            Speech works without internet using the phone&apos;s voice. Your text never leaves this phone.
          </Text>
          <View style={styles.speechComposerFooter}>
            <Text style={styles.speechCharacterCount}>
              {speechDraft.trim()
                ? `${draftLanguageLabel} voice · ${speechDraft.length}/1000`
                : `${speechDraft.length}/1000`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Speak typed text in ${draftLanguageLabel}`}
              disabled={speechLoading || !speechDraft.trim()}
              onPress={speakDraft}
              style={[styles.speakDraftButton, (speechLoading || !speechDraft.trim()) && styles.addWordButtonDisabled]}
            >
              {speechLoading
                ? <ActivityIndicator color="#ffffff" size="small" />
                : <Text style={styles.speakDraftButtonText}>▶  Speak</Text>}
            </Pressable>
          </View>
          {speechError ? <Text accessibilityRole="alert" style={styles.speechError}>{speechError}</Text> : null}
          {Platform.OS === 'android' ? (
            <View style={styles.voiceChoiceBox}>
              <Text style={styles.voiceChoiceLabel}>FILIPINO &amp; BISAYA VOICE</Text>
              <View style={styles.voiceChoiceRow}>
                {([['phone', 'Filipino voice (natural)'], ['builtin', 'Clear voice']] as const).map(([choice, label]) => (
                  <Pressable
                    key={choice}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filipinoVoice === choice }}
                    onPress={() => chooseFilipinoVoice(choice)}
                    style={[styles.voiceChoiceButton, filipinoVoice === choice && styles.voiceChoiceButtonActive]}
                  >
                    <Text style={[styles.voiceChoiceText, filipinoVoice === choice && styles.voiceChoiceTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search messages"
            placeholder="Search words or phrases"
            placeholderTextColor="#8b96a8"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')}>
              <Text style={styles.clearSearch}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.languageRow}>
          <Text style={styles.sectionLabel}>LANGUAGE</Text>
          <View style={styles.languageOptions}>
            {languages.map((item) => {
              const active = item.code === language;
              return (
                <Pressable
                  key={item.code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLanguage(item.code)}
                  style={[styles.languageButton, active && styles.languageButtonActive]}
                >
                  <Text style={[styles.languageButtonText, active && styles.languageButtonTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Choose a category</Text>
          <View style={styles.categoryHeaderActions}>
            <Pressable accessibilityRole="button" onPress={() => void refreshContent()}>
              <Text style={styles.refreshText}>{syncing ? 'Updating…' : '↻ Refresh'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setShowCategoryInput((visible) => !visible); setCustomCategoryError(null); }}
              style={styles.addCategoryButton}
            >
              <Text style={styles.addCategoryButtonText}>+ Add category</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          <CategoryChip
            label="All"
            selected={selectedCategory === null}
            onPress={() => setSelectedCategory(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              selected={selectedCategory === category.slug}
              onPress={() => setSelectedCategory(category.slug)}
            />
          ))}
          {customCategories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              selected={selectedCategory === category.id}
              onPress={() => setSelectedCategory(category.id)}
              custom
            />
          ))}
        </ScrollView>

        {showCategoryInput ? (
          <View style={styles.categoryForm}>
            <TextInput
              accessibilityLabel="New category name"
              placeholder="Name your category"
              placeholderTextColor="#8b96a8"
              value={customCategoryInput}
              onChangeText={(text) => { setCustomCategoryInput(text); setCustomCategoryError(null); }}
              onSubmitEditing={() => void saveCustomCategory()}
              returnKeyType="done"
              maxLength={40}
              style={styles.customInput}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!customWordsReady || !customCategoryInput.trim()}
              onPress={() => void saveCustomCategory()}
              style={[styles.addWordButton, (!customWordsReady || !customCategoryInput.trim()) && styles.addWordButtonDisabled]}
            >
              <Text style={styles.addWordButtonText}>Create</Text>
            </Pressable>
            {customCategoryError ? <Text style={styles.customError}>{customCategoryError}</Text> : null}
          </View>
        ) : null}

        {selectedCategory ? (
        <View style={styles.customPanel}>
          <View style={styles.customHeader}>
            <View style={styles.customHeaderCopy}>
              <Text style={styles.customTitle}>{selectedCategoryName ? `Words in ${selectedCategoryName}` : 'Your words'}</Text>
              <Text style={styles.customSubtitle}>
                {selectedCategoryName
                  ? `${savedWordsForLanguage.length} saved · ${selectedLanguageLabel}`
                  : `Choose a category above to add a word · ${selectedLanguageLabel}`}
              </Text>
            </View>
            <Text style={styles.customHeaderIcon}>✚</Text>
          </View>
          <View style={styles.customInputRow}>
            <TextInput
              accessibilityLabel="Add a word or phrase to the selected category"
              editable={selectedCategory !== null && customWordsReady}
              placeholder={selectedCategory ? 'Add a word or phrase' : 'Choose a category first'}
              placeholderTextColor="#8b96a8"
              value={customWordInput}
              onChangeText={(text) => { setCustomWordInput(text); setCustomWordError(null); }}
              onSubmitEditing={addPendingWord}
              returnKeyType="done"
              maxLength={100}
              style={[styles.customInput, !selectedCategory && styles.customInputDisabled]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add word to ${selectedCategoryName ?? 'selected category'}`}
              disabled={!customWordsReady || !selectedCategory || !customWordInput.trim()}
              onPress={addPendingWord}
              style={[styles.addWordButton, (!customWordsReady || !selectedCategory || !customWordInput.trim()) && styles.addWordButtonDisabled]}
            >
              <Text style={styles.addWordButtonText}>Add</Text>
            </Pressable>
          </View>
          {customWordError ? <Text style={styles.customError}>{customWordError}</Text> : null}
          {pendingWordsForLanguage.length > 0 ? (
            <View style={styles.pendingWordSection}>
              <Text style={styles.pendingSectionLabel}>Added · waiting to save</Text>
              {pendingWordsForLanguage.map((word) => (
                <View key={word.id} style={styles.pendingWordCard}>
                  {languages.map((item) => (
                    <View key={item.code} style={styles.translationRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Speak the ${item.label} text`}
                        onPress={() => speakText(wordTextIn(word, item.code) ?? '', item.code)}
                        style={styles.translationSpeak}
                      >
                        <Text style={styles.customWordSpeaker}>🔊</Text>
                        <Text style={styles.translationLabel}>{item.label}</Text>
                      </Pressable>
                      <TextInput
                        accessibilityLabel={`${item.label} text for this word`}
                        value={word.texts?.[item.code] ?? ''}
                        onChangeText={(value) => updatePendingTranslation(word.id, item.code, value)}
                        maxLength={100}
                        style={styles.translationInput}
                      />
                    </View>
                  ))}
                  {word.needsTranslationCheck ? (
                    <Text style={styles.translationHint}>
                      No automatic translation found. Names and food often stay the same; otherwise type the translation above.
                    </Text>
                  ) : null}
                  <View style={styles.pendingActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Save ${word.text} to ${customCategories.find((category) => category.id === word.categoryId)?.name ?? categories.find((category) => category.slug === word.categoryId)?.name ?? 'category'}`}
                      onPress={() => void saveCustomWord(word)}
                      style={styles.savePendingButton}
                    >
                      <Text style={styles.savePendingText}>Save</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete unsaved ${word.text}`}
                      onPress={() => discardPendingWord(word.id)}
                      style={styles.removeWordButton}
                    >
                      <Text style={styles.removeWordText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.customEmptyText}>
              {selectedCategory
                ? 'Add a word, then save it to this category. Saved words appear in the board below.'
                : 'Choose a category above. Words waiting to be saved will appear here.'}
            </Text>
          )}
        </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              {selectedCategoryName ?? 'Communication board'}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {`${visibleMessages.length} messages · Tap a card to speak`}
            </Text>
          </View>
          <View style={styles.speechHint}><Text style={styles.speechHintText}>🔊</Text></View>
        </View>

        {lastRemovedMessage ? (
          <View style={styles.removedNotice}>
            <Text numberOfLines={2} style={styles.removedNoticeText}>
              “{lastRemovedMessage.message_text ?? lastRemovedMessage.title}” was removed from this device.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void undoHideMessage()} style={styles.undoButton}>
              <Text style={styles.undoButtonText}>Undo</Text>
            </Pressable>
          </View>
        ) : null}
        {localActionError ? <Text style={styles.customError}>{localActionError}</Text> : null}
        {syncNotice ? <Text style={styles.apiHint}>{syncNotice}</Text> : null}

        {visibleMessages.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.emptyIcon}>🔎</Text>
            <Text style={styles.stateText}>No messages found. Try another search.</Text>
          </View>
        ) : (
          <View style={styles.messageGrid}>
            {visibleMessages.map((message) => (
              <View
                key={message.uuid}
                style={[styles.messageCard, { width: columnWidth }, message.is_emergency && styles.emergencyCard]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Speak: ${message.message_text ?? message.title ?? 'message'}`}
                  onPress={() => speak(message)}
                  style={({ pressed }) => [styles.messageCardBody, pressed && styles.messageCardPressed]}
                >
                  <View style={[styles.messageIcon, message.is_emergency && styles.emergencyIcon]}>
                    <Text style={styles.messageEmoji}>{getIcon(message.icon, message.is_emergency)}</Text>
                  </View>
                  {message.is_emergency ? <Text style={styles.emergencyLabel}>EMERGENCY</Text> : null}
                  <Text style={styles.messageTitle}>{message.title ?? message.message_text}</Text>
                  {message.title && message.message_text !== message.title ? (
                    <Text numberOfLines={3} style={styles.messageText}>{message.message_text}</Text>
                  ) : null}
                </Pressable>
                <View style={styles.cardFooter}>
                  <Text numberOfLines={1} style={styles.cardCategory}>{message.category?.name ?? 'Message'}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Speak: ${message.message_text ?? message.title ?? 'message'}`}
                    onPress={() => speak(message)}
                    style={styles.speakerIcon}
                  >
                    <Text style={styles.speakerIconText}>▶</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${message.message_text ?? message.title ?? 'message'} from this device`}
                    onPress={() => message.uuid.startsWith('custom:')
                      ? void removeCustomWord(message.uuid.slice('custom:'.length))
                      : void hideMessage(message)}
                    style={styles.deleteMessageButton}
                  >
                    <Text style={styles.deleteMessageText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {lastSpoken ? (
          <View style={styles.lastSpoken}>
            <Text style={styles.lastSpokenLabel}>SPEAKING</Text>
            <Text style={styles.lastSpokenText}>{lastSpoken}</Text>
          </View>
        ) : null}
        <Text style={styles.footer}>Your words stay available on this board whenever you need them.</Text>
      </ScrollView>
    </View>
  );
}

function CategoryChip({ label, selected, onPress, custom = false }: { label: string; selected: boolean; onPress: () => void; custom?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.categoryChip, custom && styles.customCategoryChip, selected && styles.categoryChipSelected]}
    >
      <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f7fb' },
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 42 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 26, gap: 14 },
  brandMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerText: { flex: 1 },
  eyebrow: { color: '#2563eb', fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 5 },
  title: { color: '#111827', fontSize: 23, fontWeight: '800', lineHeight: 29 },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#e9f8ef', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  onlineDot: { height: 8, width: 8, borderRadius: 5, backgroundColor: '#16a34a' },
  onlineText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  languageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 },
  sectionLabel: { color: '#6b778a', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  languageOptions: { flexDirection: 'row', backgroundColor: '#e9eef6', padding: 4, borderRadius: 12, gap: 3 },
  languageButton: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  languageButtonActive: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  languageButtonText: { color: '#667085', fontSize: 12, fontWeight: '600' },
  languageButtonTextActive: { color: '#1d4ed8', fontWeight: '800' },
  speechComposer: { backgroundColor: '#fff', borderColor: '#e0e7f0', borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 22 },
  speechTextInput: { minHeight: 96, backgroundColor: '#f8fafc', borderColor: '#e0e7f0', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: '#182230', fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  speechComposerFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  speechCharacterCount: { color: '#8793a5', fontSize: 11 },
  speakDraftButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', borderRadius: 11, paddingHorizontal: 18 },
  speakDraftButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  speechError: { color: '#b42318', fontSize: 12, lineHeight: 17, marginTop: 9 },
  speechPrivacyNote: { color: '#68758b', fontSize: 11, lineHeight: 16, marginTop: 7 },
  customPanel: { backgroundColor: '#fff', borderColor: '#e0e7f0', borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 22 },
  customHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  customHeaderCopy: { gap: 3 },
  customTitle: { color: '#1c2738', fontSize: 15, fontWeight: '800' },
  customSubtitle: { color: '#8793a5', fontSize: 11 },
  customHeaderIcon: { color: '#2563eb', fontSize: 20, fontWeight: '700' },
  customInputRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  customInput: { flex: 1, minWidth: 0, height: 44, backgroundColor: '#f8fafc', borderColor: '#e0e7f0', borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, color: '#182230', fontSize: 14 },
  customInputDisabled: { backgroundColor: '#f1f3f6', color: '#8b96a8' },
  addWordButton: { minWidth: 66, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', borderRadius: 11, paddingHorizontal: 15 },
  addWordButtonDisabled: { backgroundColor: '#91aff4' },
  addWordButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  customError: { color: '#b42318', fontSize: 12, marginTop: 7 },
  customEmptyText: { color: '#8793a5', fontSize: 11, marginTop: 10 },
  pendingWordSection: { gap: 8, marginTop: 12 },
  pendingSectionLabel: { color: '#6b778a', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  pendingWordCard: { gap: 7, backgroundColor: '#edf3ff', borderRadius: 12, padding: 9 },
  translationRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  translationSpeak: { width: 84, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  translationLabel: { color: '#24448a', fontSize: 11, fontWeight: '800' },
  translationInput: { flex: 1, minWidth: 0, height: 38, backgroundColor: '#fff', borderColor: '#d6e0f0', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, color: '#182230', fontSize: 13 },
  translationHint: { color: '#9a6700', fontSize: 11 },
  pendingActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  pendingWordRow: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#edf3ff', borderRadius: 12, padding: 6 },
  customWordSpeak: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 4 },
  customWordSpeaker: { fontSize: 13 },
  customWordText: { color: '#24448a', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  savePendingButton: { minWidth: 52, minHeight: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', borderRadius: 9, paddingHorizontal: 8 },
  savePendingText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  removeWordButton: { minWidth: 58, minHeight: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2', borderRadius: 9, marginLeft: 8, paddingHorizontal: 8 },
  removeWordText: { color: '#b42318', fontSize: 11, fontWeight: '800' },
  searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderColor: '#e0e7f0', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, marginBottom: 24 },
  searchIcon: { color: '#76849a', fontSize: 26, marginRight: 8, transform: [{ rotate: '-20deg' }] },
  searchInput: { flex: 1, color: '#182230', fontSize: 15 },
  clearSearch: { color: '#64748b', fontSize: 24, paddingHorizontal: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  categoryHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionTitle: { color: '#1c2738', fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { color: '#718096', fontSize: 12, marginTop: 4 },
  refreshText: { color: '#2563eb', fontSize: 13, fontWeight: '700', padding: 6 },
  addCategoryButton: { backgroundColor: '#eaf0ff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  addCategoryButtonText: { color: '#1d4ed8', fontSize: 12, fontWeight: '800' },
  categoryRow: { gap: 9, paddingBottom: 24 },
  categoryChip: { backgroundColor: '#fff', borderColor: '#dce4ef', borderWidth: 1, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 9 },
  customCategoryChip: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  categoryChipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  categoryChipText: { color: '#526074', fontSize: 12, fontWeight: '700' },
  categoryChipTextSelected: { color: '#fff' },
  categoryForm: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9, backgroundColor: '#fff', borderColor: '#dce4ef', borderWidth: 1, borderRadius: 14, padding: 12, marginTop: -10, marginBottom: 16 },
  speechHint: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#e8efff', justifyContent: 'center', alignItems: 'center' },
  speechHintText: { fontSize: 18 },
  removedNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: '#edf6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 14 },
  removedNoticeText: { flex: 1, color: '#334155', fontSize: 12, lineHeight: 17 },
  undoButton: { minHeight: 34, justifyContent: 'center', borderRadius: 9, backgroundColor: '#dbeafe', paddingHorizontal: 12 },
  undoButtonText: { color: '#1d4ed8', fontSize: 12, fontWeight: '800' },
  centerState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  stateText: { color: '#718096', fontSize: 14, textAlign: 'center' },
  messageGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 13 },
  messageCard: { minHeight: 180, flexDirection: 'column', backgroundColor: '#fff', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 18, padding: 15, shadowColor: '#0f172a', shadowOpacity: 0.035, shadowRadius: 7, elevation: 1 },
  emergencyCard: { backgroundColor: '#fff9f8', borderColor: '#ffd7d2' },
  messageCardBody: { flex: 1, borderRadius: 12 },
  messageCardPressed: { transform: [{ scale: 0.98 }], backgroundColor: '#eff5ff' },
  messageIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef4ff', borderRadius: 15, marginBottom: 12 },
  emergencyIcon: { backgroundColor: '#ffe8e5' },
  messageEmoji: { fontSize: 26 },
  emergencyLabel: { color: '#c24132', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  messageTitle: { color: '#172033', fontSize: 15, fontWeight: '800', lineHeight: 20 },
  messageText: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 5 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 'auto', paddingTop: 12 },
  cardCategory: { color: '#8491a4', fontSize: 10, flex: 1, marginRight: 6 },
  speakerIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf3ff', overflow: 'hidden', borderRadius: 8 },
  speakerIconText: { color: '#2563eb', fontSize: 12, fontWeight: '900' },
  deleteMessageButton: { minHeight: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 8 },
  deleteMessageText: { color: '#b42318', fontSize: 10, fontWeight: '800' },
  errorCard: { backgroundColor: '#fff', borderColor: '#fecaca', borderWidth: 1, borderRadius: 16, padding: 20, marginVertical: 10 },
  errorTitle: { color: '#991b1b', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  errorText: { color: '#64748b', fontSize: 13, lineHeight: 19 },
  apiHint: { color: '#8793a5', fontSize: 11, marginTop: 10 },
  voiceChoiceBox: { marginTop: 12, gap: 7 },
  voiceChoiceLabel: { color: '#6b778a', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  voiceChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  voiceChoiceButton: { backgroundColor: '#f1f5f9', borderColor: '#dce4ef', borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  voiceChoiceButtonActive: { backgroundColor: '#eaf0ff', borderColor: '#2563eb' },
  voiceChoiceText: { color: '#526074', fontSize: 12, fontWeight: '700' },
  voiceChoiceTextActive: { color: '#1d4ed8', fontWeight: '800' },
  retryButton: { alignSelf: 'flex-start', backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 },
  retryButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  emptyIcon: { fontSize: 36 },
  lastSpoken: { backgroundColor: '#eaf1ff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginTop: 22 },
  lastSpokenLabel: { color: '#2563eb', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4 },
  lastSpokenText: { color: '#1e293b', fontSize: 15, fontWeight: '700' },
  footer: { color: '#97a2b3', textAlign: 'center', fontSize: 11, marginTop: 22 },
});
