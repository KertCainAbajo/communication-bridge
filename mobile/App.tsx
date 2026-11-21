import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, useFonts } from '@expo-google-fonts/atkinson-hyperlegible';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import Storage from 'expo-sqlite/kv-store';
import { type ComponentRef, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Alert,
  AppState,
  Dimensions,
  PixelRatio,
  Image,
  Platform,
  Pressable,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StatusBar as RNStatusBar,
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
import { SignWord } from './signLanguage';
import { navigationBarHeight } from './modules/system-insets';
import { fastSpeech } from './modules/fast-speech';
import { uiText, type UiText } from './uiText';
import { FadeIn, Toast, type ToastMessage } from './motion';
import { downloadTranslator, isTranslatorAvailable, isTranslatorReady, translateOffline } from './modules/offline-translator';
import { checkBuiltInVoiceHealth, prepareBuiltInVoice, preloadBuiltInVoice, speakWithBuiltInVoiceInParts } from './builtInVoice';

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '');
const apiV1Url = `${apiBaseUrl}/v1`;
const customWordsStorageKey = 'communication-bridge.custom-words.v1';
const customCategoriesStorageKey = 'communication-bridge.custom-categories.v1';
const hiddenMessagesStorageKey = 'communication-bridge.hidden-messages.v1';
const offlineContentStorageKey = 'communication-bridge.offline-content.v1';
// Which voice reads Filipino and Bisaya: the phone's own Google voice (natural) or the built-in one.
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
  // Filled in by the on-device translator (Google ML Kit): shown with a "please check" note.
  machineTranslated?: boolean;
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
  'nasaan', 'nasan', 'asan', 'ngayon', 'bukas', 'kahapon', 'ayoko', 'kong', 'lumabas', 'umuwi', 'uuwi', 'tiyan', 'ulo',
  'mata', 'ilong', 'likod',
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
  // Words used in both languages (so they don't point to Filipino).
  'tiyan', 'ulo', 'mata', 'kamot', 'tiil', 'ngipon', 'dalunggan', 'ilong', 'baba', 'likod', 'lawas',
];

const strongBisayaWords = [
  'imong', 'iyang', 'nako', 'nimo', 'naa', 'dili', 'unsa', 'asa', 'kaayo', 'gyud', 'jud', 'ug', 'og', 'ganahan',
  'kinahanglan', 'palihug', 'tabangi', 'gigutom', 'giuhaw', 'kapoy', 'mouli', 'mokaon', 'moinom', 'karon', 'ugma', 'diri',
];
const strongBisayaSet = new Set(strongBisayaWords);

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
  // Words only Bisaya speakers use always count as Bisaya, even if a Filipino board phrase contains them.
  strongBisayaWords.forEach((word) => { filipino.delete(word); bisaya.add(word); });
  return { en: english, local, fil: filipino, ceb: bisaya };
}

const languageVocabulary = buildLanguageVocabulary(initialContent);
const translateText = createTranslator(initialContent.languages);

// A unique id for a word added on this phone.
function newWordId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

  // Words only Bisaya speakers use count double; 'akong' (used in both) only breaks a tie.
  const bisayaScore = count(languageVocabulary.ceb) + count(strongBisayaSet) + (words.includes('akong') ? 0.5 : 0);
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

// A voice on the phone. `offline` is true when it is downloaded (works without internet).
type PhoneVoice = { identifier: string; language: string; offline: boolean };

// Reads the phone's voices once. The app's own speech module (Android) reports which voices are
// really downloaded; elsewhere voices with "network" in their name are taken to need internet.
async function readPhoneVoices(): Promise<PhoneVoice[]> {
  if (fastSpeech) {
    const voices = await fastSpeech.getVoices().catch(() => []);
    return voices.map((voice) => ({
      identifier: voice.identifier,
      language: voice.language,
      offline: !voice.networkRequired && !voice.notInstalled,
    }));
  }
  const voices = await Speech.getAvailableVoicesAsync().catch(() => [] as Speech.Voice[]);
  return voices.map((voice) => ({ identifier: voice.identifier, language: voice.language, offline: !/network/i.test(voice.identifier) }));
}

// Stops the phone's voice (the app's own speech module on Android, expo-speech elsewhere).
function stopPhoneSpeech(): Promise<void> {
  return fastSpeech ? fastSpeech.stop() : Speech.stop();
}

// If the phone's voice has not started speaking after this long, the next voice is used (in the end
// the built-in one), so a tap is never left silent.
const phoneVoiceStartTimeoutMs = 1500;

// Each spoken text gets its own id, to match the voice's "done" and "error" reports to it.
let utteranceCount = 0;
function nextUtteranceId(): string {
  utteranceCount += 1;
  return `utterance-${utteranceCount}`;
}

function isOnlineOnlyVoice(voice: PhoneVoice): boolean {
  return !voice.offline;
}

function findDeviceVoice(voices: PhoneVoice[], aliases: string[]): PhoneVoice | undefined {
  for (const alias of aliases) {
    const matches = voices.filter((voice) => {
      const locale = normalizeVoiceLocale(voice.language);
      return locale === alias || locale.startsWith(`${alias}-`);
    });
    // Prefer voices that are installed on the phone (no internet needed).
    const installed = matches.find((voice) => voice.offline);
    if (installed ?? matches[0]) return installed ?? matches[0];
  }
  return undefined;
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
  // Space taken by the phone's navigation buttons or gesture bar (3-button phones need more room).
  // Read from Android once the screen is laid out, and again when the screen size changes.
  const [bottomInset, setBottomInset] = useState(16);
  useEffect(() => {
    const read = () => setBottomInset(Math.max(8, navigationBarHeight() ?? 16));
    const timer = setTimeout(read, 0);
    const subscription = Dimensions.addEventListener('change', read);
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  const { width, height } = useWindowDimensions();
  // Small phones (about 4 to 5 inch screens) get a slightly more compact header.
  const narrow = width < 360;
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const chipScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // Atkinson Hyperlegible: a typeface designed for readability (low vision, early readers).
  const [fontsLoaded] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, ...Ionicons.font });
  const [language, setLanguage] = useState<(typeof languages)[number]['code']>('en');
  // The app's own words in the chosen language (EN / FIL switch).
  const t = uiText[language];
  const [content, setContent] = useState<OfflineContent>(initialContent);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [speechDraft, setSpeechDraft] = useState('');
  // Hand signs for the typed text: updated just after typing (so typing stays smooth on slow phones)
  // and limited to the first letters (a hand image per letter is heavy for long texts).
  const deferredDraft = useDeferredValue(speechDraft);
  // While typing, the finished words are made into speech in the background, so tapping Speak
  // starts at once. Waits for a short pause in typing, so typing itself is never slowed down.
  useEffect(() => {
    const text = deferredDraft.trim();
    if (!text) return;
    const timer = setTimeout(() => {
      const voice = detectSpeechVoice(text, language);
      // Typing: the last word counts as finished once a space or punctuation follows it (the extra
      // " ." stands in for the unfinished word that is left out).
      prepareBuiltInVoice(/[\s.,!?]$/.test(deferredDraft) ? `${text} .` : text, voice, true);
    }, 350);
    return () => clearTimeout(timer);
  }, [deferredDraft, language]);
  // Every typed word gets hand signs (up to maxTypedSignLetters letters).
  const typedSigns = useMemo(() => firstLetters(deferredDraft, maxTypedSignLetters), [deferredDraft]);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechLoading, setSpeechLoading] = useState(false);
  // True while something is being said (the Speak button then becomes a Stop button).
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechPlayer = useAudioPlayer(null, { downloadFirst: true });
  const speechPlayerStatus = useAudioPlayerStatus(speechPlayer);
  // Warms up the sound player when the app opens (loads a recording without playing it), so the
  // very first tap plays as fast as the later ones.
  useEffect(() => {
    const first = Object.values(offlineSpeech)[0];
    if (first !== undefined) speechPlayer.replace(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The phone's voices, read once. Reading them when the app opens also starts Android's voice
  // engine, so the first tap speaks right away (speech sent before the engine is ready can be lost).
  const phoneVoicesRef = useRef<PhoneVoice[] | null>(null);
  // Every tap to speak gets the next number; only the newest tap may start speaking. With fast taps
  // an older tap could otherwise reach the voice after a newer one, and Android then queued the
  // newer card behind it (it seemed not to respond).
  const speechRequestRef = useRef(0);
  const loadPhoneVoices = async (): Promise<PhoneVoice[]> => {
    const voices = await readPhoneVoices();
    if (voices.length > 0) phoneVoicesRef.current = voices;
    return voices;
  };
  useEffect(() => {
    void readPhoneVoices().then((voices) => {
      if (voices.length > 0) phoneVoicesRef.current = voices;
    });
  }, []);
  // The built-in voice of the board language is loaded in the background (a few seconds on cheap
  // phones), so the first typed or added word does not wait for loading.
  useEffect(() => {
    const timer = setTimeout(() => preloadBuiltInVoice(language === 'fil' ? 'fil' : 'en'), 1500);
    return () => clearTimeout(timer);
  }, [language]);
  // "Done" and "error" reports from the app's speech module, passed to the text they belong to.
  const utteranceHandlersRef = useRef(new Map<string, { started: () => void; finished: () => void; failed: () => void }>());
  useEffect(() => {
    if (!fastSpeech) return;
    const handlers = utteranceHandlersRef.current;
    const finish = ({ id }: { id: string }) => { handlers.get(id)?.finished(); handlers.delete(id); };
    const fail = ({ id }: { id: string }) => { const handler = handlers.get(id); handlers.delete(id); handler?.failed(); };
    const start = ({ id }: { id: string }) => handlers.get(id)?.started();
    const subscriptions = [
      fastSpeech.addListener('onStart', start),
      fastSpeech.addListener('onDone', finish),
      fastSpeech.addListener('onStop', finish),
      fastSpeech.addListener('onError', fail),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  // Coming back to the app: reconnect the phone's voice if Android closed it in the background,
  // before the next tap (otherwise that tap waits about a second for the reconnection).
  useEffect(() => {
    if (!fastSpeech) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fastSpeech?.ensureReady().catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  // Hour of the day for the greeting (read once when the app opens).
  const [greetingHour] = useState(() => new Date().getHours());
  // The last sentences spoken from the Speak screen, to say again with one tap.
  const [recentlySaid, setRecentlySaid] = useState<string[]>([]);
  // Two screens: the communication board and the "Speak anything" typing screen.
  const [activeTab, setActiveTab] = useState<'board' | 'speak'>('board');
  // Called when speech ends.
  const speechFinished = () => setIsSpeaking(false);

  // Parts of a sentence made by the built-in voice, played one after the other while the next
  // parts are being made (see speakBuiltIn in speakText).
  const builtInPartsRef = useRef<string[]>([]);
  const builtInPlayingRef = useRef(false);
  const builtInMakingRef = useRef(false);
  const playBuiltInPart = (uri: string) => {
    builtInPlayingRef.current = true;
    speechPlayer.replace({ uri });
    speechPlayer.play();
  };
  const clearBuiltInParts = () => {
    builtInPartsRef.current = [];
    builtInPlayingRef.current = false;
    builtInMakingRef.current = false;
  };

  useEffect(() => {
    if (!speechPlayerStatus.didJustFinish) return;
    const nextPart = builtInPartsRef.current.shift();
    if (nextPart) {
      playBuiltInPart(nextPart);
      return;
    }
    builtInPlayingRef.current = false;
    // More parts are still being made: the next one plays as soon as it is ready.
    if (!builtInMakingRef.current) speechFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechPlayerStatus.didJustFinish]);

  const [customWords, setCustomWords] = useState<CustomWord[]>([]);
  useEffect(() => { customWordsRef.current = customWords; }, [customWords]);
  const [pendingWords, setPendingWords] = useState<CustomWord[]>([]);
  // On-device translator for any sentence: 'unavailable' (web / Expo Go), 'missing' (not downloaded yet),
  // 'downloading', 'ready' or 'failed' (download failed, e.g. no internet).
  const [translatorStatus, setTranslatorStatus] = useState<'unavailable' | 'missing' | 'downloading' | 'ready' | 'failed'>('unavailable');
  const [translatingWordIds, setTranslatingWordIds] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [customCategoryError, setCustomCategoryError] = useState<string | null>(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  useEffect(() => { hiddenMessageIdsRef.current = hiddenMessageIds; }, [hiddenMessageIds]);
  // Alert banners after saving or removing (with Undo where possible).
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastCounter = useRef(0);
  const hideToast = useCallback(() => setToast(null), []);
  const showToast = (kind: ToastMessage['kind'], message: string, action?: { actionLabel: string; onAction: () => void }) => {
    toastCounter.current += 1;
    setToast({ id: toastCounter.current, kind, message, ...action });
  };
  // Latest saved words and hidden phrases, so "Undo" never works from an out-of-date copy.
  const customWordsRef = useRef<CustomWord[]>([]);
  const hiddenMessageIdsRef = useRef<string[]>([]);
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
      setSyncNotice(t.phrasesUpdated);
    } catch {
      setSyncNotice(t.noInternetPhrases);
    } finally {
      setSyncing(false);
    }
  };

  const categories = useMemo(() => (content.languages[language]?.categories ?? [])
    .map((category) => ({ ...category, name: categoryNameIn(category.name, language) })), [content, language]);
  const messages = useMemo(() => {
    const languageMessages = content.languages[language]?.messages ?? [];
    if (!selectedCategory || selectedCategory.startsWith(customCategoryPrefix)) return languageMessages;
    return languageMessages.filter((message) => message.category.slug === selectedCategory);
  }, [content, language, selectedCategory]);

  // How many phrases each category chip holds, leaving out removed phrases and counting added words.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    const add = (key: string | undefined) => {
      total += 1;
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    for (const message of content.languages[language]?.messages ?? []) {
      if (!hiddenMessageIds.includes(message.uuid)) add(message.category?.slug);
    }
    for (const word of customWords) {
      if (wordTextIn(word, language)) add(word.categoryId);
    }
    return { total, counts };
  }, [content, language, hiddenMessageIds, customWords]);

  const visibleMessages = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const customCategorySelected = selectedCategory?.startsWith(customCategoryPrefix) ?? false;
    const availableMessages = customCategorySelected
      ? []
      : messages
        .filter((message) => !hiddenMessageIds.includes(message.uuid))
        .map((message) => (language === 'fil' && message.category
          ? { ...message, category: { ...message.category, name: categoryNameIn(message.category.name, language) } }
          : message));
    const localWordMessages: CommunicationMessage[] = customWords
      .filter((word) => wordTextIn(word, language) && (!selectedCategory || word.categoryId === selectedCategory))
      .map((word) => {
        const localCategory = categories.find((category) => category.slug === word.categoryId);
        const addedCategory = customCategories.find((category) => category.id === word.categoryId);
        const categoryName = localCategory?.name ?? addedCategory?.name ?? uiText[language].yourWords;

        return {
          uuid: `custom:${word.id}`,
          slug: `custom-${word.id}`,
          title: capitalizeFirst(wordTextIn(word, language) ?? word.text),
          message_text: capitalizeFirst(wordTextIn(word, language) ?? word.text),
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

  // Speaks with the first phone voice in the list. Phones often list voices that are not downloaded;
  // Android then reports an error, and the next voice in the list is used, so speech never stays silent.
  const speakWithPhoneVoices = async (
    attempts: { text: string; aliases: string[] }[],
    isNewest: () => boolean = () => true,
    onAllFailed?: () => void,
  ): Promise<boolean> => {
    // The voice list is read once (see loadPhoneVoices); asking Android for it on every tap
    // added about a second before each card spoke.
    const voices = phoneVoicesRef.current ?? await loadPhoneVoices();
    // Voices downloaded on the phone come first, in the order asked. Online-only voices are tried
    // last: without internet Android waits several seconds before giving up on them, which felt
    // like the app not responding.
    const installedVoices = voices.filter((voice) => !isOnlineOnlyVoice(voice));
    const onlineVoices = voices.filter(isOnlineOnlyVoice);
    const options = [installedVoices, onlineVoices].flatMap((pool) => attempts.flatMap((attempt) => {
      const voice = findDeviceVoice(pool, attempt.aliases);
      return voice ? [{ text: attempt.text, voice }] : [];
    }));
    if (options.length === 0) return false;

    const speakOption = (index: number) => {
      const { text, voice } = options[index];
      // Only the newest speech may hide the "Now speaking" bar (an older one stopped by a new tap
      // used to hide it while the new card was still speaking).
      const finished = () => { if (isNewest()) speechFinished(); };
      const failed = () => {
        // A newer tap has taken over: don't fall back to another voice for this old one.
        if (!isNewest()) return;
        if (index + 1 < options.length) speakOption(index + 1);
        else if (onAllFailed) onAllFailed();
        else {
          setSpeechError(t.phoneVoiceFailed);
          speechFinished();
        }
      };
      if (fastSpeech) {
        // The app's own speech module: the new text replaces the current one at once.
        const id = nextUtteranceId();
        const handlers = utteranceHandlersRef.current;
        // Not started in time (voice app busy or broken): stop it and use the next voice.
        const watchdog = setTimeout(() => {
          if (!handlers.has(id)) return;
          handlers.delete(id);
          if (!isNewest()) return;
          void fastSpeech?.stop();
          preloadBuiltInVoice();
          failed();
        }, phoneVoiceStartTimeoutMs);
        handlers.set(id, {
          started: () => clearTimeout(watchdog),
          finished: () => { clearTimeout(watchdog); finished(); },
          failed: () => { clearTimeout(watchdog); failed(); },
        });
        void fastSpeech.speak(id, text, voice.identifier, voice.language, 0.88, 1.02).catch(() => {
          clearTimeout(watchdog);
          handlers.delete(id);
          failed();
        });
        return;
      }
      Speech.speak(text, {
        language: voice.language,
        voice: voice.identifier,
        rate: 0.88,
        pitch: 1.02,
        onDone: finished,
        onStopped: finished,
        onError: failed,
      });
    };
    // The app's speech module replaces the current speech by itself; expo-speech needs a stop first.
    if (!fastSpeech) await Speech.stop();
    // Another card was tapped meanwhile: let that one speak instead of queueing this one first.
    if (!isNewest()) return true;
    speakOption(0);
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
    const requestId = speechRequestRef.current + 1;
    speechRequestRef.current = requestId;
    const isNewest = () => speechRequestRef.current === requestId;
    // Anything still playing or waiting from the built-in voice belongs to an older text.
    clearBuiltInParts();
    // Clears an old error once the voice has started (after it, so redrawing never delays the voice).
    const showNowSpeaking = () => {
      setSpeechError(null);
      setIsSpeaking(true);
    };

    // Natural recordings made with Google's voice (scripts/generate-natural-audio.mjs) come first.
    const speechKey = normalizeSpeechKey(text);
    const bundledAudio = offlineSpeech[`${languageCode}:${speechKey}`]
      ?? (languageCode === 'ceb' ? offlineSpeech[`fil:${speechKey}`] : undefined);
    if (bundledAudio !== undefined) {
      // Played at once; stopping the phone voice is not awaited, so nothing delays the sound.
      clearBuiltInParts();
      speechPlayer.replace(bundledAudio);
      speechPlayer.play();
      void stopPhoneSpeech().catch(() => undefined);
      showNowSpeaking();
      return;
    }

    // The voice inside the app, part by part: the first words play while the rest is being made.
    // Returns false if this phone cannot use it.
    const speakBuiltIn = async (): Promise<boolean> => {
      if (!isNewest()) return true;
      clearBuiltInParts();
      builtInMakingRef.current = true;
      // Not awaited: stopping the phone voice must not delay the first sound.
      void stopPhoneSpeech().catch(() => undefined);
      // "Getting ready…" only if nothing is heard within a moment (redrawing first would delay it).
      let started = false;
      const readyHint = setTimeout(() => { if (!started && isNewest()) setSpeechLoading(true); }, 400);
      try {
        return await speakWithBuiltInVoiceInParts(text, languageCode, {
          isCancelled: () => !isNewest(),
          onPart: (uri) => {
            if (!isNewest()) return;
            if (builtInPlayingRef.current) builtInPartsRef.current.push(uri);
            else playBuiltInPart(uri);
            if (!started) {
              started = true;
              showNowSpeaking();
              setSpeechLoading(false);
            }
          },
        }).catch(() => false);
      } finally {
        clearTimeout(readyHint);
        if (isNewest()) {
          builtInMakingRef.current = false;
          setSpeechLoading(false);
          if (!builtInPlayingRef.current) speechFinished();
        }
      }
    };
    // When every phone voice fails or does not start, the built-in voice speaks instead.
    const useBuiltInInstead = () => {
      void speakBuiltIn().then((spoken) => {
        if (!spoken && isNewest()) {
          setSpeechError(t.phoneVoiceFailed);
          speechFinished();
        }
      });
    };

    try {
      // The built-in MMS voices first, for every language: clear, the same on every phone, and
      // instant for anything said or prepared before. The phone's own voice is only a last resort.
      if (Platform.OS === 'android' && await speakBuiltIn()) return;
      if (!isNewest()) return;
      speechPlayer.pause();
      if (languageCode !== 'en' && Platform.OS === 'android') {
        // Filipino and Bisaya, best voice first:
        // 1. the phone's Google Filipino voice (natural), if installed;
        // 2. Google's Indonesian voice, which reads Filipino spelling with nearly the right sounds
        //    (a e i o u, hard g, ng);
        // 3. the English voice, which every phone has.
        const spokenText = prepareForEnglishVoice(text, languageCode);
        const attempts = [
          { text, aliases: speechLanguageAliases.fil },
          { text: spokenText, aliases: indonesianVoiceAliases },
          { text: spokenText, aliases: speechLanguageAliases.en },
        ];
        if (await speakWithPhoneVoices(attempts, isNewest, useBuiltInInstead)) {
          if (isNewest()) showNowSpeaking();
          return;
        }
      }
      if (languageCode === 'en' && await speakWithPhoneVoices([{ text, aliases: speechLanguageAliases.en }], isNewest, useBuiltInInstead)) {
        if (isNewest()) showNowSpeaking();
        return;
      }
      if (languageCode !== 'en' && await speakWithPhoneVoices([{ text, aliases: speechLanguageAliases[languageCode] }], isNewest)) {
        if (isNewest()) showNowSpeaking();
        return;
      }

      setSpeechError(Platform.OS === 'web'
        ? t.noVoiceWeb(selectedLanguage.label)
        : languageCode === 'en'
          ? t.noEnglishVoice
          : t.noOfflineVoice(selectedLanguage.label));
    } catch {
      setSpeechError(t.couldNotSpeak(selectedLanguage.label));
    } finally {
      setSpeechLoading(false);
    }
  };

  // Stops whatever is being said: a recording, the built-in voice (and the parts still being
  // made) or the phone's voice.
  const stopSpeaking = () => {
    // A new request id makes every part, fallback and "done" report of the old speech be ignored.
    speechRequestRef.current += 1;
    clearBuiltInParts();
    speechPlayer.pause();
    void stopPhoneSpeech().catch(() => undefined);
    setSpeechLoading(false);
    setIsSpeaking(false);
  };

  const speak = (message: CommunicationMessage) => {
    const phrase = message.message_text?.trim();
    if (!phrase) return;

    speakText(phrase);
  };

  const speakDraft = () => {
    const phrase = speechDraft.trim();
    if (!phrase) return;
    // "Recently said" is updated after the voice has started, so drawing it never delays the voice.
    void speakText(phrase, detectSpeechVoice(phrase, language)).then(() =>
      setRecentlySaid((previous) => [phrase, ...previous.filter((item) => item !== phrase)].slice(0, 6)));
  };

  const addPendingWord = () => {
    const text = customWordInput.trim();
    if (!selectedCategory) {
      setCustomWordError(t.chooseCategoryFirst);
      return;
    }
    if (!text) {
      setCustomWordError(t.typeWordFirst);
      return;
    }

    const sourceLanguage = detectTextLanguage(text, language);
    const targetLanguage = otherLanguage(sourceLanguage);
    const isDuplicate = [...customWords, ...pendingWords].some((word) =>
      word.categoryId === selectedCategory
      && wordTextIn(word, sourceLanguage)?.toLocaleLowerCase() === text.toLocaleLowerCase()
    );
    if (isDuplicate) {
      setCustomWordError(t.wordAlreadyAdded);
      return;
    }

    // The app's own phrases and patterns first; names and food (e.g. "Adobo") usually stay the same, so
    // unknown words are copied and flagged. Then the on-device translator tries (not for Bisaya, which it
    // does not know).
    const translated = translateText(text, sourceLanguage, targetLanguage);
    const word: CustomWord = {
      id: newWordId(),
      text,
      language: sourceLanguage,
      categoryId: selectedCategory,
      texts: { [sourceLanguage]: text, [targetLanguage]: translated ?? text },
      needsTranslationCheck: translated === null,
    };
    setPendingWords((words) => [...words, word]);
    setCustomWordInput('');
    setCustomWordError(null);
    if (translated === null && detectSpeechVoice(text, language) !== 'ceb') {
      void translateWithTranslator(word.id, text, sourceLanguage, targetLanguage);
    }
  };

  // Fills in a pending word's translation with the on-device translator, unless the person already typed one.
  const translateWithTranslator = async (id: string, text: string, from: LanguageCode, to: LanguageCode) => {
    setTranslatingWordIds((ids) => [...ids, id]);
    try {
      const result = await translateOffline(text, from, to);
      if (!result) return;
      setPendingWords((words) => words.map((word) =>
        word.id === id && word.needsTranslationCheck && word.texts?.[to] === text
          ? { ...word, texts: { ...word.texts, [to]: result }, needsTranslationCheck: false, machineTranslated: true }
          : word));
    } finally {
      setTranslatingWordIds((ids) => ids.filter((wordId) => wordId !== id));
    }
  };

  // Downloads the translator's Filipino language pack once (about 30 MB, needs internet), then retries
  // the words still waiting for a translation.
  const downloadTranslatorNow = async () => {
    setTranslatorStatus('downloading');
    try {
      await downloadTranslator(false);
      setTranslatorStatus('ready');
      pendingWords
        .filter((word) => word.needsTranslationCheck)
        .forEach((word) => {
          const from = word.language as LanguageCode;
          void translateWithTranslator(word.id, word.text, from, otherLanguage(from));
        });
    } catch {
      setTranslatorStatus('failed');
    }
  };

  // On start: check the translator; if it is not downloaded yet, download it in the background on Wi-Fi only
  // (so it never uses the user's mobile data).
  useEffect(() => {
    if (!isTranslatorAvailable()) return;
    let active = true;
    void (async () => {
      const ready = await isTranslatorReady();
      if (!active) return;
      setTranslatorStatus(ready ? 'ready' : 'missing');
      if (!ready && (await downloadTranslator(true).catch(() => false)) && active) setTranslatorStatus('ready');
    })();
    return () => { active = false; };
  }, []);

  const updatePendingTranslation = (id: string, code: LanguageCode, value: string) => {
    setPendingWords((words) => words.map((word) =>
      word.id === id ? { ...word, texts: { ...word.texts, [code]: value }, needsTranslationCheck: false } : word));
  };

  const saveCustomWord = async (pendingWord: CustomWord) => {
    const englishText = wordTextIn(pendingWord, 'en')?.trim();
    const filipinoText = wordTextIn(pendingWord, 'fil')?.trim();
    if (!englishText || !filipinoText) {
      setCustomWordError(t.typeBothLanguages);
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
      const categoryName = customCategories.find((category) => category.id === word.categoryId)?.name
        ?? categories.find((category) => category.slug === word.categoryId)?.name;
      showToast('success', t.savedWord(wordTextIn(word, language) ?? word.text, categoryName ?? undefined));
      // Make the word's recordings now (in the background), so tapping its card speaks at once.
      prepareBuiltInVoice(englishText, 'en');
      const filipinoVoice = detectSpeechVoice(filipinoText, 'fil');
      prepareBuiltInVoice(filipinoText, filipinoVoice === 'en' ? 'fil' : filipinoVoice);
    } catch {
      setCustomWordError(t.couldNotSaveWord);
    }
  };

  const discardPendingWord = (id: string) => {
    const discarded = pendingWords.find((word) => word.id === id);
    setPendingWords((words) => words.filter((word) => word.id !== id));
    setCustomWordError(null);
    if (discarded) showToast('info', t.discardedWord(discarded.text));
  };

  const storeCustomWords = async (words: CustomWord[]) => {
    if (Platform.OS === 'web') window.localStorage.setItem(customWordsStorageKey, JSON.stringify(words));
    else await Storage.setItem(customWordsStorageKey, JSON.stringify(words));
  };

  // Puts a removed word back (from the "Undo" button).
  const restoreCustomWord = async (word: CustomWord) => {
    const updatedWords = [...customWordsRef.current.filter((item) => item.id !== word.id), word];
    try {
      await storeCustomWords(updatedWords);
      setCustomWords(updatedWords);
      showToast('success', t.restored(wordTextIn(word, language) ?? word.text));
    } catch {
      setCustomWordError(t.couldNotRestoreWord);
    }
  };

  const removeCustomWord = async (id: string) => {
    const removed = customWords.find((word) => word.id === id);
    const updatedWords = customWords.filter((word) => word.id !== id);

    try {
      await storeCustomWords(updatedWords);
      setCustomWords(updatedWords);
      setCustomWordError(null);
      if (removed) {
        showToast('removed', t.removed(wordTextIn(removed, language) ?? removed.text), {
          actionLabel: t.undo,
          onAction: () => void restoreCustomWord(removed),
        });
      }
    } catch {
      setCustomWordError(t.couldNotRemoveWord);
    }
  };

  const saveCustomCategory = async () => {
    const name = customCategoryInput.trim();
    if (!name) {
      setCustomCategoryError(t.typeCategoryFirst);
      return;
    }

    const duplicate = [...categories.map((category) => category.name), ...customCategories.map((category) => category.name)]
      .some((existingName) => existingName.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      setCustomCategoryError(t.categoryExists);
      return;
    }

    const category: CustomCategory = {
      id: `${customCategoryPrefix}${newWordId()}`,
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
      // Show the new category's chip (it is added at the end of the row, often off-screen).
      setTimeout(() => chipScrollRef.current?.scrollToEnd({ animated: true }), 150);
      showToast('success', t.categoryCreated(name));
    } catch {
      setCustomCategoryError(t.couldNotSaveCategory);
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
      setLocalActionError(null);
      showToast('removed', t.removed(message.title ?? message.message_text ?? t.phraseFallback), {
        actionLabel: t.undo,
        onAction: () => void undoHideMessage(message),
      });
    } catch {
      setLocalActionError(t.couldNotRemoveMessage);
    }
  };

  const undoHideMessage = async (message: CommunicationMessage) => {
    const updatedIds = hiddenMessageIdsRef.current.filter((id) => id !== message.uuid);
    try {
      const value = JSON.stringify(updatedIds);
      if (Platform.OS === 'web') {
        window.localStorage.setItem(hiddenMessagesStorageKey, value);
      } else {
        await Storage.setItem(hiddenMessagesStorageKey, value);
      }
      setHiddenMessageIds(updatedIds);
      setLocalActionError(null);
      showToast('success', t.restored(message.title ?? message.message_text ?? t.phraseFallback));
    } catch {
      setLocalActionError(t.couldNotRestoreMessage);
    }
  };

  const savedWordsForLanguage = customWords.filter((word) =>
    wordTextIn(word, language) && (!selectedCategory || word.categoryId === selectedCategory)
  );
  const pendingWordsForLanguage = pendingWords.filter((word) =>
    !selectedCategory || word.categoryId === selectedCategory
  );
  const draftLanguageLabel = voiceLabels[detectSpeechVoice(speechDraft, language)];
  const selectedCategoryName = selectedCategory?.startsWith(customCategoryPrefix)
    ? customCategories.find((category) => category.id === selectedCategory)?.name ?? t.customCategory
    : categories.find((category) => category.slug === selectedCategory)?.name ?? null;

  // Hand-sign size on the Speak screen (full width, same look as the cards).

  // One wide card per row on phones (hand signs fit in one neat row), two side by side on tablets.
  // Cards in columns: two on phones, three on tablets.
  // Two per row on phones, three on tablets; one per row when the phone's text is so large that two
  // would be too narrow for the words (width counted in "text widths").
  const columnCount = width >= 700 ? 3 : width / PixelRatio.getFontScale() >= 300 ? 2 : 1;
  const columnWidth: `${number}%` = columnCount === 3 ? '31%' : columnCount === 2 ? '48%' : '100%';
  const cardWidth = Math.floor((width - 32 - 12 * (columnCount - 1)) / columnCount);
  const categoryColor = (slug: string | undefined) => categories.find((category) => category.slug === slug)?.color ?? palette.sky;
  const accentFor = useStableCallback((message: CommunicationMessage) =>
    message.is_emergency ? palette.coral : categoryColor(message.category?.slug));
  // The card whose hand signs are shown big (opened by tapping a card).
  // The hand-sign panel: a tapped card's word, or the text typed on the Speak screen.
  type SignSheet = { title: string | null; text: string | null; signs: string; shortened: boolean; color: string; speak: () => void };
  const [signSheet, setSignSheet] = useState<SignSheet | null>(null);
  // True while more hand signs are hidden below in the panel (shows the "scroll down" hint).
  const [signsMoreBelow, setSignsMoreBelow] = useState(false);
  // True when the signs don't fit, so the hint keeps its space (the panel doesn't jump when it hides).
  const [signsOverflow, setSignsOverflow] = useState(false);
  const signsScroll = useRef({ view: 0, content: 0, offset: 0 });
  const onSignsScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    signsScroll.current.offset = nativeEvent.contentOffset.y;
    signsScroll.current.view = nativeEvent.layoutMeasurement.height;
    signsScroll.current.content = nativeEvent.contentSize.height;
    updateSignsMoreBelow();
  };
  const updateSignsMoreBelow = () => {
    const { view, content, offset } = signsScroll.current;
    const more = view > 0 && content - view - offset > 12;
    setSignsMoreBelow((current) => (current === more ? current : more));
    const overflow = view > 0 && content - view > 12;
    setSignsOverflow((current) => (current === overflow ? current : overflow));
  };
  const speakMessage = useStableCallback((message: CommunicationMessage) => {
    speak(message);
    const title = message.title ?? message.message_text ?? '';
    const sentence = message.title && message.message_text !== message.title ? message.message_text : null;
    // The panel opens just after the voice has started, so drawing it never delays the voice.
    setTimeout(() => setSignSheet({ title, text: sentence, signs: title, shortened: false, color: accentFor(message), speak: () => speak(message) }), 120);
  });
  const showTypedSigns = () => {
    const phrase = speechDraft.trim();
    if (!typedSigns.text) return;
    setSignSheet({
      title: null,
      text: phrase,
      signs: typedSigns.text,
      shortened: typedSigns.shortened,
      color: palette.brand,
      speak: () => void speakText(phrase, detectSpeechVoice(phrase, language)),
    });
  };
  const signSheetWidth = width - 2 * 16 - 2 * 20 - 2 * 12;
  // A card's word: as big as fits. Typed text: a comfortable size, scrolling when long.
  const signSheetSize = signSheet?.title
    ? fitSignSize(signSheet.signs, signSheetWidth, Math.round(height * 0.42), 72)
    : Math.max(30, Math.min(48, Math.floor((signSheetWidth + 2) / 6) - 2));
  const removeMessage = useStableCallback((message: CommunicationMessage) => {
    if (message.uuid.startsWith('custom:')) void removeCustomWord(message.uuid.slice('custom:'.length));
    else void hideMessage(message);
  });

  if (!fontsLoaded) {
    return <View style={styles.loadingScreen}><ActivityIndicator color={palette.brand} size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {/* Header: brand row, greeting, language */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={[styles.logoTile, narrow && styles.logoTileNarrow]}>
              <Image
                accessibilityLabel="Combri logo"
                source={require('./assets/logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.brandCopy}>
              <Text numberOfLines={2} style={[styles.brandName, narrow && styles.brandNameNarrow]}>Combri</Text>
              <View style={styles.statusLine}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{t.offlineReady}</Text>
              </View>
            </View>
            <View style={styles.languageSwitch} accessibilityRole="radiogroup" accessibilityLabel="Board language">
              {languages.map((item) => {
                const active = item.code === language;
                return (
                  <Pressable
                    key={item.code}
                    accessibilityRole="radio"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => setLanguage(item.code)}
                    style={[styles.languageOption, narrow && styles.languageOptionNarrow, active && styles.languageOptionActive]}
                  >
                    <Text style={[styles.languageOptionText, active && styles.languageOptionTextActive]}>
                      {item.code === 'en' ? 'EN' : 'FIL'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* The greeting only on the board, so the typing pad and Speak button fit on small phones. */}
          {activeTab === 'board' ? (
            <View style={styles.greeting}>
              <Text style={styles.greetingEyebrow}>{greetingFor(greetingHour, language)}</Text>
              <Text accessibilityRole="header" style={styles.greetingTitle}>
                {language === 'fil' ? 'Ano ang gusto mong sabihin?' : 'What would you like to say?'}
              </Text>
            </View>
          ) : null}
        </View>

        {activeTab === 'board' ? (
        <FadeIn>
        {/* Quick words, laid out like an AAC board: the two most-used answers big and bold,
            the other core words smaller below. */}
        <View style={styles.section}>
          <View style={styles.quickHeader}>
            <Text style={styles.sectionLabel}>{language === 'fil' ? 'MABILISANG SALITA' : 'QUICK WORDS'}</Text>
            <Text style={styles.quickHint}>{language === 'fil' ? 'Pindutin para magsalita' : 'Tap to speak'}</Text>
          </View>
          <View style={styles.answerRow}>
            {quickWords.slice(0, 2).map((word) => {
              const label = language === 'fil' ? word.fil : word.en;
              const otherLabel = language === 'fil' ? word.en : word.fil;
              return (
                <Pressable
                  key={word.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Say ${label}`}
                  onPress={() => void speakText(label, language)}
                  style={({ pressed }) => [styles.answerTile, { backgroundColor: word.color }, pressed && styles.tilePressed]}
                >
                  <View style={styles.answerTop}>
                    <Text style={styles.answerOther}>{otherLabel}</Text>
                    <View style={styles.answerIcon}>
                      <Ionicons name={word.icon} size={20} color={word.color} />
                    </View>
                  </View>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={styles.answerLabel}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.coreRow}>
            {quickWords.slice(2).map((word) => {
              const label = language === 'fil' ? word.fil : word.en;
              const otherLabel = language === 'fil' ? word.en : word.fil;
              return (
                <Pressable
                  key={word.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Say ${label}`}
                  onPress={() => void speakText(label, language)}
                  style={({ pressed }) => [styles.coreTile, { backgroundColor: word.soft, borderColor: word.border }, pressed && styles.tilePressed]}
                >
                  <View style={[styles.coreIcon, { backgroundColor: word.color }]}>
                    <Ionicons name={word.icon} size={18} color={palette.white} />
                  </View>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.coreLabel, { color: word.text }]}>{label}</Text>
                  <Text numberOfLines={1} style={styles.coreOther}>{otherLabel}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        </FadeIn>
        ) : null}

        {/* Speak anything (its own tab) */}
        {activeTab === 'speak' ? (
        <FadeIn>
        <View style={styles.speakSection}>
          <View>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{t.speakTitle}</Text>
            <Text style={styles.sectionSubtitle}>{t.speakSubtitle}</Text>
          </View>

          {/* Writing pad */}
          <View style={styles.pad}>
            <TextInput
              accessibilityLabel="Type text to speak"
              multiline
              maxLength={1000}
              placeholder={t.speakPlaceholder}
              placeholderTextColor={palette.placeholder}
              value={speechDraft}
              onChangeText={setSpeechDraft}
              // Autocorrect would change Bisaya and Filipino words (e.g. "sa" → "said").
              autoCorrect={false}
              spellCheck={false}
              // The keyboard's Enter key speaks, so the Speak button is not needed while typing.
              returnKeyType="send"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={speakDraft}
              // Long text scrolls inside the box (fixed height), so the Speak button stays in view.
              scrollEnabled
              style={[styles.padInput, height < 700 && styles.padInputCompact]}
            />
            <View style={styles.padToolbar}>
              {speechDraft.trim() ? (
                <View style={styles.voicePill}>
                  <Ionicons name="volume-medium" size={14} color={palette.brand} />
                  <Text numberOfLines={1} style={styles.voicePillText}>{t.voicePill(draftLanguageLabel)}</Text>
                </View>
              ) : (
                <Text style={styles.padHint}>{t.voiceChosenForYou}</Text>
              )}
              <Text style={styles.characterCount}>{speechDraft.length}/1000</Text>
              {speechDraft.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear the text"
                  hitSlop={8}
                  onPress={() => setSpeechDraft('')}
                  style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
                >
                  <Ionicons name="close" size={16} color={palette.inkSoft} />
                  <Text style={styles.clearButtonText}>{t.clear}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {isSpeaking || speechLoading ? (
            // While speaking (or getting ready) the same button stops the voice.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.stopSpeaking}
              onPress={stopSpeaking}
              style={({ pressed }) => [styles.speakButton, styles.stopButton, pressed && styles.tilePressed]}
            >
              {speechLoading
                ? <ActivityIndicator color={palette.white} size="small" />
                : <Ionicons name="stop" size={22} color={palette.white} />}
              <Text style={styles.speakButtonText}>{speechLoading ? `${t.gettingReady}  ·  ${t.stop}` : t.stop}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Speak typed text in ${draftLanguageLabel}`}
              accessibilityState={{ disabled: !speechDraft.trim() }}
              disabled={!speechDraft.trim()}
              onPress={speakDraft}
              style={({ pressed }) => [styles.speakButton, !speechDraft.trim() && styles.speakButtonDisabled, pressed && styles.tilePressed]}
            >
              <Ionicons name="volume-high" size={22} color={speechDraft.trim() ? palette.white : palette.muted} />
              <Text style={[styles.speakButtonText, !speechDraft.trim() && styles.speakButtonTextDisabled]}>{t.speak}</Text>
            </Pressable>
          )}
          {speechError ? <Text accessibilityRole="alert" style={styles.errorText}>{speechError}</Text> : null}

          {/* Hand signs of the typed text, on request (a long text made the screen very long). */}
          {typedSigns.text ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.showHandSigns}
              onPress={showTypedSigns}
              style={({ pressed }) => [styles.signsButton, pressed && styles.tilePressed]}
            >
              <Ionicons name="hand-left-outline" size={20} color={palette.brand} />
              <Text style={styles.signsButtonText}>{t.showHandSigns}</Text>
            </Pressable>
          ) : null}

          {/* Recently said */}
          {recentlySaid.length > 0 ? (
            <View style={styles.recentBlock}>
              <View style={styles.quickHeader}>
                <Text style={styles.sectionLabel}>{t.recentlySaid}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear all recently said"
                  hitSlop={8}
                  onPress={() => {
                    const cleared = recentlySaid;
                    setRecentlySaid([]);
                    showToast('removed', t.clearedRecentlySaid, { actionLabel: t.undo, onAction: () => setRecentlySaid(cleared) });
                  }}
                  style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
                >
                  <Ionicons name="trash-outline" size={15} color={palette.inkSoft} />
                  <Text style={styles.clearButtonText}>{t.clearAll}</Text>
                </Pressable>
              </View>
              <View style={styles.recentList}>
                {recentlySaid.map((phrase) => (
                  <Pressable
                    key={phrase}
                    accessibilityRole="button"
                    accessibilityLabel={`Say again: ${phrase}`}
                    onPress={() => void speakText(phrase, detectSpeechVoice(phrase, language))}
                    style={({ pressed }) => [styles.recentChip, pressed && styles.tilePressed]}
                  >
                    <Ionicons name="refresh" size={14} color={palette.brand} />
                    <Text numberOfLines={1} style={styles.recentChipText}>{phrase}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={14} color={palette.muted} />
            <Text style={styles.privacyText}>{t.privacy}</Text>
          </View>
          {/* Credits required by the licences of the bundled voice and hand drawings. */}
          <Text style={styles.creditsText}>
            {t.credits}
          </Text>
        </View>

        </FadeIn>
        ) : null}

        {activeTab === 'board' ? (
        <FadeIn delay={60}>
        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={palette.muted} />
          <TextInput
            accessibilityLabel="Search messages"
            placeholder={t.searchPlaceholder}
            placeholderTextColor={palette.placeholder}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={styles.iconButton}>
              <Ionicons name="close-circle" size={20} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Categories */}
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{t.categories}</Text>
          <View style={styles.sectionActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={syncing ? 'Updating phrases' : 'Refresh phrases'}
              onPress={() => void refreshContent()}
              style={({ pressed }) => [styles.iconButton, styles.outlineButton, pressed && styles.pressed]}
            >
              {syncing ? <ActivityIndicator size="small" color={palette.ink} /> : <Ionicons name="refresh" size={19} color={palette.ink} />}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a category"
              onPress={() => { setShowCategoryInput((visible) => !visible); setCustomCategoryError(null); }}
              style={({ pressed }) => [styles.addCategoryButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={18} color={palette.white} />
              <Text style={styles.addCategoryText}>{t.newCategory}</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView ref={chipScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <CategoryChip
            label={t.all}
            count={categoryCounts.total}
            color={palette.ink}
            selected={selectedCategory === null}
            onPress={() => setSelectedCategory(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              count={categoryCounts.counts.get(category.slug) ?? 0}
              color={category.color ?? palette.sky}
              selected={selectedCategory === category.slug}
              onPress={() => setSelectedCategory(category.slug)}
            />
          ))}
          {customCategories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              count={categoryCounts.counts.get(category.id) ?? 0}
              color={palette.green}
              selected={selectedCategory === category.id}
              onPress={() => setSelectedCategory(category.id)}
            />
          ))}
        </ScrollView>

        {showCategoryInput ? (
          <View style={[styles.inlineForm, styles.categoryForm]}>
            <TextInput
              accessibilityLabel="New category name"
              placeholder={t.categoryNamePlaceholder}
              placeholderTextColor={palette.placeholder}
              value={customCategoryInput}
              onChangeText={(text) => { setCustomCategoryInput(text); setCustomCategoryError(null); }}
              onSubmitEditing={() => void saveCustomCategory()}
              returnKeyType="done"
              maxLength={40}
              autoCorrect={false}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!customWordsReady || !customCategoryInput.trim()}
              onPress={() => void saveCustomCategory()}
              style={[styles.primarySmall, (!customWordsReady || !customCategoryInput.trim()) && styles.speakButtonDisabled]}
            >
              <Text style={styles.primarySmallText}>{t.create}</Text>
            </Pressable>
            {customCategoryError ? <Text style={styles.errorText}>{customCategoryError}</Text> : null}
          </View>
        ) : null}

        {/* Add words to the selected category */}
        {selectedCategory ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: palette.greenSoft }]}>
                <Ionicons name="add-circle" size={22} color={palette.green} />
              </View>
              <View style={styles.cardHeaderCopy}>
                <Text accessibilityRole="header" style={styles.cardTitle}>{selectedCategoryName ? t.addTo(selectedCategoryName) : t.yourWords}</Text>
                <Text style={styles.cardSubtitle}>{t.savedCount(savedWordsForLanguage.length)}</Text>
              </View>
            </View>
            <View style={styles.inlineForm}>
              <TextInput
                accessibilityLabel="Add a word or phrase to the selected category"
                editable={customWordsReady}
                placeholder={t.wordPlaceholder}
                placeholderTextColor={palette.placeholder}
                value={customWordInput}
                onChangeText={(text) => { setCustomWordInput(text); setCustomWordError(null); }}
                onSubmitEditing={addPendingWord}
                returnKeyType="done"
                maxLength={100}
                autoCorrect={false}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add word to ${selectedCategoryName ?? 'selected category'}`}
                disabled={!customWordsReady || !customWordInput.trim()}
                onPress={addPendingWord}
                style={[styles.primarySmall, (!customWordsReady || !customWordInput.trim()) && styles.speakButtonDisabled]}
              >
                <Text style={styles.primarySmallText}>{t.add}</Text>
              </Pressable>
            </View>
            {customWordError ? <Text style={styles.errorText}>{customWordError}</Text> : null}
            {pendingWordsForLanguage.length > 0 ? (
              <View style={styles.pendingList}>
                <Text style={styles.sectionLabel}>{t.checkAndSave}</Text>
                {pendingWordsForLanguage.map((word) => (
                  <View key={word.id} style={styles.pendingCard}>
                    {languages.map((item) => (
                      <View key={item.code} style={styles.translationRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Speak the ${item.label} text`}
                          onPress={() => speakText(wordTextIn(word, item.code) ?? '', item.code)}
                          style={styles.translationLabelButton}
                        >
                          <Ionicons name="volume-medium-outline" size={16} color={palette.brand} />
                          <Text style={styles.translationLabel}>{item.label}</Text>
                        </Pressable>
                        <TextInput
                          accessibilityLabel={`${item.label} text for this word`}
                          value={word.texts?.[item.code] ?? ''}
                          onChangeText={(value) => updatePendingTranslation(word.id, item.code, value)}
                          maxLength={100}
                          autoCorrect={false}
                          style={styles.translationInput}
                        />
                      </View>
                    ))}
                    {translatingWordIds.includes(word.id) ? (
                      <View style={styles.hintRow}>
                        <ActivityIndicator size="small" color={palette.brand} />
                        <Text style={styles.hintText}>{t.translating}</Text>
                      </View>
                    ) : word.machineTranslated ? (
                      <View style={styles.hintRow}>
                        <Ionicons name="sparkles" size={14} color={palette.brand} />
                        <Text style={styles.hintText}>{t.translatedCheck}</Text>
                      </View>
                    ) : word.needsTranslationCheck ? (
                      <Text style={styles.warningText}>
                        {t.noTranslation}
                        {translatorStatus === 'missing' || translatorStatus === 'failed' ? (
                          <>
                            {' '}
                            <Text style={styles.linkText} onPress={() => void downloadTranslatorNow()}>{t.downloadTranslator}</Text>
                            {translatorStatus === 'failed'
                              ? t.translatorFailed
                              : t.translatorOffer}
                          </>
                        ) : null}
                        {translatorStatus === 'downloading' ? t.translatorDownloading : null}
                      </Text>
                    ) : null}
                    <View style={styles.pendingActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete unsaved ${word.text}`}
                        onPress={() => discardPendingWord(word.id)}
                        style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.ghostButtonText}>{t.discard}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Save ${word.text} to ${customCategories.find((category) => category.id === word.categoryId)?.name ?? categories.find((category) => category.slug === word.categoryId)?.name ?? 'category'}`}
                        onPress={() => void saveCustomWord(word)}
                        style={({ pressed }) => [styles.primarySmall, pressed && styles.pressed]}
                      >
                        <Ionicons name="checkmark" size={18} color={palette.white} />
                        <Text style={styles.primarySmallText}>{t.save}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>{t.addHelper}</Text>
            )}
          </View>
        ) : null}

        {/* Communication board */}
        <View style={styles.sectionHeader}>
          <View>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{selectedCategoryName ?? t.boardTitle}</Text>
            <Text style={styles.sectionSubtitle}>{t.phraseCount(visibleMessages.length)}</Text>
          </View>
        </View>

        {localActionError ? <Text style={styles.errorText}>{localActionError}</Text> : null}
        {syncNotice ? <Text style={styles.helperText}>{syncNotice}</Text> : null}

        {visibleMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name="search" size={28} color={palette.brand} /></View>
            <Text style={styles.emptyTitle}>{t.noPhrases}</Text>
            <Text style={styles.helperText}>{t.noPhrasesHint}</Text>
          </View>
        ) : (
          <BoardList
            key={`${language}-${selectedCategory ?? 'all'}`}
            messages={visibleMessages}
            columnWidth={columnWidth}
            cardWidth={cardWidth}
            accentFor={accentFor}
            onSpeak={speakMessage}
            onRemove={removeMessage}
            text={t}
          />
        )}

        <View style={styles.footer}>
          <Image source={require('./assets/logo.png')} style={styles.footerLogo} resizeMode="contain" />
          <Text style={styles.footerText}>{t.footer}</Text>
        </View>
        </FadeIn>
        ) : null}
      </ScrollView>


      {/* Brand-coloured strip behind the phone's status bar, so scrolled content never sits under the clock. */}
      <View pointerEvents="none" style={styles.statusBarShade} />


      <TabBar
        active={activeTab}
        onChange={(tab) => {
          // Each tab starts at the top (the Speak screen used to open halfway down).
          if (tab !== activeTab) scrollRef.current?.scrollTo({ y: 0, animated: false });
          setActiveTab(tab);
        }}
        bottomInset={bottomInset}
        text={t}
      />

      {/* A tapped card's hand signs, big, in a panel from the bottom. */}
      <Modal
        visible={signSheet !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSignSheet(null)}
      >
        <View style={styles.signSheetBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.close} style={styles.signSheetDismiss} onPress={() => setSignSheet(null)} />
          {signSheet ? (
            <View style={[styles.signSheet, { paddingBottom: 16 + bottomInset }]}>
              <View style={[styles.signSheetStripe, { backgroundColor: signSheet.color }]} />
              <View style={styles.signSheetHeader}>
                <View style={styles.signSheetHeading}>
                  <Text style={styles.sectionLabel}>{t.handSigns}</Text>
                  {signSheet.title ? <Text accessibilityRole="header" style={styles.signSheetTitle}>{signSheet.title}</Text> : null}
                  {signSheet.text ? <Text numberOfLines={3} style={styles.signSheetSentence}>{signSheet.text}</Text> : null}
                  {signSheet.shortened ? <Text style={styles.quickHint}>{t.firstLetters(maxTypedSignLetters)}</Text> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.close}
                  hitSlop={8}
                  onPress={() => setSignSheet(null)}
                  style={({ pressed }) => [styles.signSheetClose, pressed && styles.pressed]}
                >
                  <Ionicons name="close" size={24} color={palette.ink} />
                </Pressable>
              </View>
              {/* Long text scrolls inside the panel; a hint below it (never on top of the signs, so no letter is hidden) says so until the end is reached. */}
              <View style={[styles.signSheetSignsWrap, { maxHeight: Math.round(Math.max(150, Math.min(height * 0.5, height - 380))) }]}>
                <ScrollView
                  key={signSheet.signs}
                  style={styles.signSheetSigns}
                  contentContainerStyle={styles.signSheetSignsContent}
                  persistentScrollbar
                  scrollEventThrottle={32}
                  onLayout={({ nativeEvent }) => { signsScroll.current.view = nativeEvent.layout.height; updateSignsMoreBelow(); }}
                  onContentSizeChange={(_, contentHeight) => { signsScroll.current.content = contentHeight; updateSignsMoreBelow(); }}
                  onScroll={onSignsScroll}
                  // Android can skip the last throttled scroll event, so the end position is also read when scrolling stops.
                  onScrollEndDrag={onSignsScroll}
                  onMomentumScrollEnd={onSignsScroll}
                >
                  {signSheetSize > 0 ? (
                    <SignWord
                      text={signSheet.signs}
                      size={signSheetSize}
                      maxPerLine={signLettersPerLine(signSheetWidth, signSheetSize)}
                    />
                  ) : null}
                </ScrollView>
              </View>
              {signsOverflow ? (
                <View pointerEvents="none" style={[styles.scrollHint, !signsMoreBelow && styles.hidden]} importantForAccessibility={signsMoreBelow ? 'auto' : 'no-hide-descendants'}>
                  <View style={styles.scrollHintPill}>
                    <Ionicons name="chevron-down" size={16} color={palette.white} />
                    <Text style={styles.scrollHintText}>{t.scrollForMore}</Text>
                  </View>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.speakAgain}
                onPress={signSheet.speak}
                style={({ pressed }) => [styles.speakButton, { backgroundColor: signSheet.color }, pressed && styles.tilePressed]}
              >
                <Ionicons name="volume-high" size={22} color={palette.white} />
                <Text style={styles.speakButtonText}>{t.speakAgain}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

      <Toast toast={toast} top={(RNStatusBar.currentHeight ?? 24) + 12} onHide={hideToast} />
    </View>
  );
}

// The Speak screen shows hand signs for at most this many letters.
const maxTypedSignLetters = 300;

// The text cut to whole words holding at most `limit` letters (a long single word is cut).
function firstLetters(text: string, limit: number): { text: string; shortened: boolean } {
  const words = text.trim().split(/\s+/).filter((word) => /[a-zñ]/i.test(word));
  const kept: string[] = [];
  let count = 0;
  for (const word of words) {
    const letters = word.replace(/[^a-zñ]/gi, '').length;
    if (count + letters > limit) {
      if (kept.length === 0) kept.push(word.slice(0, limit));
      return { text: kept.join(' '), shortened: true };
    }
    kept.push(word);
    count += letters;
  }
  return { text: kept.join(' '), shortened: false };
}

// Filipino names for the built-in categories (the phrase data only has English names).
const filipinoCategoryNames: Record<string, string> = {
  'Daily Needs': 'Mga Pangangailangan',
  'Classroom Communication': 'Sa Silid-aralan',
  'Emotions and Feelings': 'Damdamin',
  'Social Interaction': 'Pakikisalamuha',
  'Emergency Communication': 'Pang-emergency',
};
function categoryNameIn(name: string, language: LanguageCode): string {
  return language === 'fil' ? filipinoCategoryNames[name] ?? name : name;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

// A friendly greeting for the time of day, in the board language.
function greetingFor(hour: number, language: LanguageCode): string {
  if (hour < 12) return language === 'fil' ? 'Magandang umaga' : 'Good morning';
  if (hour < 18) return language === 'fil' ? 'Magandang hapon' : 'Good afternoon';
  return language === 'fil' ? 'Magandang gabi' : 'Good evening';
}

// A function whose identity never changes but always runs the latest version (keeps memoised cards
// from redrawing just because the screen re-rendered).
function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result): (...args: Args) => Result {
  const latest = useRef(callback);
  useEffect(() => { latest.current = callback; });
  return useCallback((...args: Args) => latest.current(...args), []);
}

type CardHandlers = {
  text: UiText;
  accentFor: (message: CommunicationMessage) => string;
  onSpeak: (message: CommunicationMessage) => void;
  onRemove: (message: CommunicationMessage) => void;
};

// Renders the first cards at once and the rest in small batches just after, so the board opens
// instantly even with many phrases. Remounts (via key) when the category or language changes.
const firstBatch = 12;
const BoardList = memo(function BoardList({ messages, columnWidth, cardWidth, text, accentFor, onSpeak, onRemove }: CardHandlers & {
  messages: CommunicationMessage[];
  columnWidth: `${number}%`;
  cardWidth: number;
}) {
  const [renderCount, setRenderCount] = useState(firstBatch);

  useEffect(() => {
    if (renderCount >= messages.length) return;
    const timer = setTimeout(() => setRenderCount((count) => count + firstBatch), 60);
    return () => clearTimeout(timer);
  }, [messages.length, renderCount]);

  // Boxes in rows: two per row on phones, three on tablets. The cards in a row share one height,
  // set by the card with the most text, so text never overlaps and the rows stay even.
  const perRow = columnWidth === '48%' ? 2 : columnWidth === '100%' ? 1 : 3;
  const shown = messages.slice(0, renderCount);
  const rows: CommunicationMessage[][] = [];
  for (let start = 0; start < shown.length; start += perRow) rows.push(shown.slice(start, start + perRow));
  return (
    <View style={styles.board}>
      {rows.map((row, rowIndex) => (
        <View key={row[0].uuid} style={styles.boardRow}>
          {row.map((message, column) => (
            <PhraseCard
              key={message.uuid}
              message={message}
              index={rowIndex * perRow + column}
              columnWidth={columnWidth}
              cardWidth={cardWidth}
              accentFor={accentFor}
              onSpeak={onSpeak}
              onRemove={onRemove}
              text={text}
            />
          ))}
        </View>
      ))}
    </View>
  );
});

// Every card is a box of the same size: a bit taller than wide.
function boxHeightFor(cardWidth: number): number {
  return Math.min(Math.round(cardWidth * 0.95), 170);
}

// The biggest hand-sign size at which the whole word (or phrase) fits in the box's sign area,
// placed the way SignWord places it: long words split into even lines, short words share a line.
function fitSignSize(title: string, width: number, height: number, largest = 44): number {
  const words = title.split(/\s+/).map((word) => word.replace(/[^a-zñ]/gi, '').length).filter((length) => length > 0);
  if (words.length === 0) return 0;
  for (let size = largest; size > 12; size -= 2) {
    const perLine = Math.max(1, Math.floor((width + 2) / (size + 2)));
    let rows = 0;
    let lineWidth = 0;
    for (const letters of words) {
      if (letters > perLine) {
        rows += Math.ceil(letters / perLine);
        lineWidth = 0;
        continue;
      }
      const wordWidth = letters * (size + 2);
      if (lineWidth > 0 && lineWidth + 14 + wordWidth <= width) {
        lineWidth += 14 + wordWidth;
      } else {
        rows += 1;
        lineWidth = wordWidth;
      }
    }
    const rowHeight = size + Math.max(8, Math.round(size * 0.36)) * 1.35 + 1;
    if (rows * rowHeight + (rows - 1) * 8 <= height) return size;
  }
  return 12;
}

// Card title size: 20 px, smaller only when the longest word would not fit on one line
// (so "Assistance" never breaks into "Assistanc / e", even with the phone's text set larger).
function titleSizeFor(title: string, cardWidth: number): { fontSize: number; lineHeight: number } {
  return fitWordsSize(title, cardWidth, cardWidth < 260 ? 24 : 28, 0.7, 1.2);
}

// Sentence size: 15 px, smaller only when its longest word would not fit on one line.
function sentenceSizeFor(sentence: string, cardWidth: number): { fontSize: number; lineHeight: number } {
  return fitWordsSize(sentence, cardWidth, 15, 0.6, 1.33);
}

// The largest size (up to `largest`) at which the longest word fits the card's width. `letterWidth`
// is a safe average letter width for the font (bold letters are wider), counted with the phone's
// text size setting, which makes every letter bigger.
function fitWordsSize(text: string, cardWidth: number, largest: number, letterWidth: number, lineHeight: number): { fontSize: number; lineHeight: number } {
  const longestWord = Math.max(1, ...text.split(/\s+/).map((word) => word.length));
  const width = cardWidth - cardPaddingLeft - cardPaddingRight;
  const fits = Math.floor(width / (longestWord * letterWidth * PixelRatio.getFontScale()));
  const fontSize = Math.max(11, Math.min(largest, fits));
  return { fontSize, lineHeight: Math.round(fontSize * lineHeight) };
}

// How many hand signs of this size fit on one line of the card.
function signLettersPerLine(availableWidth: number, size: number): number {
  return Math.max(1, Math.floor((availableWidth + 2) / (size + 2)));
}

// Card spacing (shared by the card layout and the size calculations below).
const cardPaddingLeft = 18;
const cardPaddingRight = 12;
const signPanelPadding = 8;

const PhraseCard = memo(function PhraseCard({ message, index, columnWidth, cardWidth, text: t, accentFor, onSpeak, onRemove }: CardHandlers & {
  message: CommunicationMessage;
  index: number;
  columnWidth: `${number}%`;
  cardWidth: number;
}) {
  const accent = accentFor(message);
  const title = message.title ?? message.message_text ?? '';
  const spokenText = message.message_text ?? message.title ?? 'message';
  // Every card is a box of the same size showing only the words; tapping it speaks and opens its
  // hand signs, big (see the hand-sign panel in App).
  const boxHeight = boxHeightFor(cardWidth);
  const titleStyle = titleSizeFor(title, cardWidth);
  const sentence = message.title && message.message_text !== message.title ? message.message_text : null;
  const categoryName = message.category?.name ?? t.message;
  // Removing is a long press with a confirmation, so a quick tap can only ever speak.
  const confirmRemove = () => {
    Alert.alert(t.removeTitle(title), t.removeBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.remove, style: 'destructive', onPress: () => onRemove(message) },
    ]);
  };
  return (
    <FadeIn delay={Math.min(index, 8) * 45} style={{ width: cardWidth }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Speak: ${spokenText}`}
        accessibilityHint={t.holdToRemove}
        accessibilityActions={[{ name: 'longpress', label: t.remove }]}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') confirmRemove(); }}
        onPress={() => onSpeak(message)}
        onLongPress={confirmRemove}
        delayLongPress={500}
        style={({ pressed }) => [styles.phraseCard, { minHeight: boxHeight }, message.is_emergency && styles.phraseCardEmergency, pressed && styles.cardPressed]}
      >
        {/* Category colour stripe */}
        <View style={[styles.cardStripe, { backgroundColor: accent }]} />

        <View style={styles.cardTop}>
          <View style={styles.cardCategory}>
            {message.is_emergency
              ? <Ionicons name="alert-circle" size={14} color={palette.coral} />
              : <View style={[styles.categoryDot, { backgroundColor: accent }]} />}
            <Text numberOfLines={1} style={[styles.cardCategoryText, message.is_emergency && styles.cardCategoryEmergency]}>
              {message.is_emergency ? t.emergency : categoryName.toLocaleUpperCase()}
            </Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.speakBadge, { backgroundColor: accent }]}>
            <Ionicons name="volume-high" size={18} color={palette.white} />
          </View>
        </View>

        <View style={styles.cardWords}>
          <Text style={[styles.phraseTitle, titleStyle]}>{title}</Text>
          {sentence ? <Text numberOfLines={4} style={[styles.phraseText, sentenceSizeFor(sentence, cardWidth)]}>{sentence}</Text> : null}
        </View>

        {/* Hint: tapping shows the hand signs. */}
        <View style={styles.cardSignHint}>
          <Ionicons name="hand-left-outline" size={14} color={palette.muted} />
          <Text numberOfLines={1} style={styles.cardSignHintText}>{t.cardHandSigns}</Text>
        </View>
      </Pressable>
    </FadeIn>
  );
});

function TabBar({ active, onChange, bottomInset, text }: { active: 'board' | 'speak'; onChange: (tab: 'board' | 'speak') => void; bottomInset: number; text: UiText }) {
  const tabs = [
    { key: 'board' as const, label: text.tabBoard, icon: 'grid' as const, iconOutline: 'grid-outline' as const },
    { key: 'speak' as const, label: text.tabSpeak, icon: 'chatbubble-ellipses' as const, iconOutline: 'chatbubble-ellipses-outline' as const },
  ];
  return (
    <View accessibilityRole="tablist" style={[styles.tabBar, { paddingBottom: bottomInset }]}>
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.key === 'board' ? 'Communication board' : 'Speak anything'}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <View style={styles.tabIcon}>
              {/* The selected pill is its own rounded shape (recolouring the container lost its corners on Android). */}
              {selected ? <View style={styles.tabIconHighlight} /> : null}
              <Ionicons name={selected ? tab.icon : tab.iconOutline} size={22} color={selected ? palette.brand : palette.muted} />
            </View>
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CategoryChip({ label, count, color, selected, onPress }: {
  label: string;
  count: number;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} phrases`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && { backgroundColor: color, borderColor: color }, pressed && styles.pressed]}
    >
      {!selected ? <View style={[styles.chipDot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      <View style={[styles.chipCount, selected && styles.chipCountSelected]}>
        <Text style={[styles.chipCountText, selected && styles.chipCountTextSelected]}>{count}</Text>
      </View>
    </Pressable>
  );
}

// Design tokens. Brand colours come from the Combri logo; text colours meet 4.5:1 contrast.
const palette = {
  brand: '#2A4FBF',
  brandDeep: '#1B347F',
  brandSoft: '#E9EEFC',
  sky: '#1E7FC0',
  skySoft: '#E6F2FB',
  green: '#2E8B57',
  greenSoft: '#E6F4EC',
  coral: '#D2443B',
  coralSoft: '#FDECEA',
  amber: '#B45309',
  amberSoft: '#FEF3E2',
  violet: '#6D4BC2',
  violetSoft: '#F0EBFB',
  ink: '#0F1B3D',
  inkSoft: '#3E4B66',
  muted: '#5B6780',
  placeholder: '#8A94A8',
  line: '#E7E2D9',
  canvas: '#F7F5F0',
  surface: '#FFFFFF',
  white: '#FFFFFF',
};

const fonts = {
  regular: 'AtkinsonHyperlegible_400Regular',
  bold: 'AtkinsonHyperlegible_700Bold',
};

type IconName = keyof typeof Ionicons.glyphMap;

// Core words people use most, one tap each (English / Filipino).
const quickWords: { key: string; en: string; fil: string; icon: IconName; color: string; soft: string; border: string; text: string }[] = [
  { key: 'yes', en: 'Yes', fil: 'Oo', icon: 'checkmark', color: palette.green, soft: palette.greenSoft, border: '#BFE3CD', text: '#1D5E3A' },
  { key: 'no', en: 'No', fil: 'Hindi', icon: 'close', color: palette.coral, soft: palette.coralSoft, border: '#F5C6C2', text: '#9B2C25' },
  { key: 'help', en: 'Help', fil: 'Tulong', icon: 'hand-left', color: palette.sky, soft: palette.skySoft, border: '#BBDCF2', text: '#14598A' },
  { key: 'stop', en: 'Stop', fil: 'Tigil', icon: 'stop', color: palette.amber, soft: palette.amberSoft, border: '#F6D6A8', text: '#8A3F06' },
  { key: 'thanks', en: 'Thank you', fil: 'Salamat', icon: 'heart', color: palette.brand, soft: palette.brandSoft, border: '#C9D4F6', text: palette.brandDeep },
];

const cardShadow = {
  shadowColor: '#0F1B3D',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
  screen: { flex: 1, backgroundColor: palette.canvas },
  scroll: { flex: 1 },
  page: { paddingBottom: 40 },
  pressed: { opacity: 0.82 },
  statusBarShade: { position: 'absolute', top: 0, left: 0, right: 0, height: RNStatusBar.currentHeight ?? 0, backgroundColor: palette.canvas },

  header: { paddingTop: (RNStatusBar.currentHeight ?? 24) + 12, paddingHorizontal: 20, gap: 22 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoTileNarrow: { width: 44, height: 44, borderRadius: 14 },
  logoTile: { width: 52, height: 52, borderRadius: 16, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  brandLogo: { width: 44, height: 28 },
  brandCopy: { flex: 1, gap: 3 },
  brandNameNarrow: { fontSize: 20 },
  brandName: { color: palette.ink, fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.4 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.green },
  statusText: { color: palette.muted, fontFamily: fonts.regular, fontSize: 13 },
  languageSwitch: { flexDirection: 'row', backgroundColor: palette.white, borderRadius: 14, borderWidth: 1, borderColor: palette.line, padding: 3 },
  languageOptionNarrow: { minWidth: 40, paddingHorizontal: 6 },
  languageOption: { minWidth: 48, minHeight: 40, paddingHorizontal: 10, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  languageOptionActive: { backgroundColor: palette.ink },
  languageOptionText: { color: palette.muted, fontFamily: fonts.bold, fontSize: 14, letterSpacing: 0.4 },
  languageOptionTextActive: { color: palette.white },
  greeting: { gap: 6, paddingBottom: 4 },
  greetingEyebrow: { color: palette.brand, fontFamily: fonts.bold, fontSize: 15 },
  greetingTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 32, lineHeight: 37, letterSpacing: -0.8 },

  section: { paddingHorizontal: 16, marginTop: 20, gap: 10 },
  sectionLabel: { color: palette.muted, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 24, marginBottom: 10, gap: 12 },
  sectionTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 22 },
  sectionSubtitle: { color: palette.muted, fontFamily: fonts.regular, fontSize: 14, marginTop: 2 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  quickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickHint: { color: palette.muted, fontFamily: fonts.regular, fontSize: 13 },
  tilePressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  answerRow: { flexDirection: 'row', gap: 12 },
  answerTile: { flex: 1, minHeight: 132, borderRadius: 26, padding: 16, justifyContent: 'space-between', ...cardShadow },
  answerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  answerOther: { color: 'rgba(255,255,255,0.86)', fontFamily: fonts.bold, fontSize: 15 },
  answerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  answerLabel: { color: palette.white, fontFamily: fonts.bold, fontSize: 40, letterSpacing: -1 },
  coreRow: { flexDirection: 'row', gap: 10 },
  coreTile: { flex: 1, minHeight: 104, borderRadius: 22, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, gap: 6 },
  coreIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  coreLabel: { fontFamily: fonts.bold, fontSize: 18 },
  coreOther: { color: palette.muted, fontFamily: fonts.regular, fontSize: 13 },

  card: { backgroundColor: palette.surface, marginHorizontal: 16, marginTop: 20, borderRadius: 24, padding: 18, gap: 14, ...cardShadow },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeaderIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardHeaderCopy: { flex: 1 },
  cardTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 19 },
  cardSubtitle: { color: palette.muted, fontFamily: fonts.regular, fontSize: 14, marginTop: 1 },

  composerInput: { minHeight: 120, backgroundColor: palette.canvas, borderColor: palette.line, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, color: palette.ink, fontFamily: fonts.regular, fontSize: 20, lineHeight: 28, textAlignVertical: 'top' },
  composerInputLarge: { minHeight: 200 },
  composerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voicePill: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  voicePillText: { flexShrink: 1, color: palette.brand, fontFamily: fonts.bold, fontSize: 13 },
  characterCount: { marginLeft: 'auto', color: palette.muted, fontFamily: fonts.regular, fontSize: 13 },
  speakButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 60, borderRadius: 20, backgroundColor: palette.brand, ...cardShadow },
  speakButtonDisabled: { backgroundColor: '#E4E0D8', shadowOpacity: 0, elevation: 0 },
  stopButton: { backgroundColor: palette.coral },
  speakButtonText: { color: palette.white, fontFamily: fonts.bold, fontSize: 20 },
  speakButtonTextDisabled: { color: palette.muted },
  speakSection: { paddingHorizontal: 16, marginTop: 24, gap: 14 },
  pad: { backgroundColor: palette.surface, borderRadius: 24, borderWidth: 1, borderColor: palette.line, ...cardShadow },
  padInputCompact: { minHeight: 120, maxHeight: 150 },
  padInput: { minHeight: 210, maxHeight: 240, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, color: palette.ink, fontFamily: fonts.regular, fontSize: 24, lineHeight: 32, textAlignVertical: 'top' },
  padToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.line },
  padHint: { flex: 1, color: palette.muted, fontFamily: fonts.regular, fontSize: 13 },
  clearButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: palette.canvas },
  clearButtonText: { color: palette.inkSoft, fontFamily: fonts.bold, fontSize: 13 },
  recentBlock: { gap: 8 },

  recentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  recentChipText: { flexShrink: 1, color: palette.ink, fontFamily: fonts.bold, fontSize: 15 },
  segmented: { flexDirection: 'row', backgroundColor: palette.canvas, borderRadius: 16, padding: 4, gap: 4 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 12 },
  segmentActive: { backgroundColor: palette.brand },
  segmentText: { color: palette.inkSoft, fontFamily: fonts.bold, fontSize: 14 },
  segmentTextActive: { color: palette.white },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privacyText: { flex: 1, color: palette.muted, fontFamily: fonts.regular, fontSize: 12 },
  creditsText: { color: palette.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, textAlign: 'center' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 20, minHeight: 54, paddingHorizontal: 16, backgroundColor: palette.surface, borderRadius: 18, borderWidth: 1, borderColor: palette.line },
  searchInput: { flex: 1, color: palette.ink, fontFamily: fonts.regular, fontSize: 17, paddingVertical: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconButtonSoft: { backgroundColor: palette.brandSoft },
  outlineButton: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  addCategoryButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 22, backgroundColor: palette.ink },
  addCategoryText: { color: palette.white, fontFamily: fonts.bold, fontSize: 14 },

  chipRow: { paddingHorizontal: 16, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingLeft: 14, paddingRight: 8, borderRadius: 999, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  chipDot: { width: 9, height: 9, borderRadius: 5 },
  chipText: { color: palette.ink, fontFamily: fonts.bold, fontSize: 15 },
  chipTextSelected: { color: palette.white },
  chipCount: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center' },
  chipCountSelected: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipCountText: { color: palette.muted, fontFamily: fonts.bold, fontSize: 13 },
  chipCountTextSelected: { color: palette.white },

  categoryForm: { paddingHorizontal: 16 },
  inlineForm: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12, paddingHorizontal: 0 },
  input: { flex: 1, minWidth: 0, minHeight: 50, backgroundColor: palette.canvas, borderColor: palette.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, color: palette.ink, fontFamily: fonts.regular, fontSize: 16 },
  primarySmall: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: palette.brand },
  primarySmallText: { color: palette.white, fontFamily: fonts.bold, fontSize: 15 },
  ghostButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ghostButtonText: { color: palette.coral, fontFamily: fonts.bold, fontSize: 15 },
  errorText: { color: '#B42318', fontFamily: fonts.bold, fontSize: 14 },
  helperText: { color: palette.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, paddingHorizontal: 16 },
  warningText: { color: '#8A4B00', fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  linkText: { color: palette.brand, fontFamily: fonts.bold, textDecorationLine: 'underline' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { color: palette.brand, fontFamily: fonts.bold, fontSize: 13 },

  pendingList: { gap: 10 },
  pendingCard: { backgroundColor: palette.canvas, borderRadius: 18, padding: 12, gap: 10, borderWidth: 1, borderColor: palette.line },
  translationRow: { gap: 4 },
  translationLabelButton: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4 },
  translationLabel: { color: palette.brand, fontFamily: fonts.bold, fontSize: 14 },
  translationInput: { minHeight: 44, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, color: palette.ink, fontFamily: fonts.regular, fontSize: 16 },
  pendingActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },

  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  noticeText: { flex: 1, color: palette.inkSoft, fontFamily: fonts.regular, fontSize: 14 },
  noticeAction: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: palette.brandSoft, justifyContent: 'center' },
  noticeActionText: { color: palette.brand, fontFamily: fonts.bold, fontSize: 14 },

  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 18 },

  board: { gap: 12, paddingHorizontal: 16 },
  boardRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  phraseCard: { flex: 1, overflow: 'hidden', backgroundColor: palette.surface, borderRadius: 20, paddingTop: 12, paddingBottom: 14, paddingLeft: cardPaddingLeft, paddingRight: cardPaddingRight, gap: 6, borderWidth: 1, borderColor: palette.line, ...cardShadow },
  phraseCardEmergency: { backgroundColor: '#FFF7F5', borderColor: '#F5CDC8' },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.94 },
  cardStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardCategory: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardCategoryText: { flexShrink: 1, color: palette.inkSoft, fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.5 },
  cardCategoryEmergency: { color: palette.coral },
  speakBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  phraseTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.3 },
  phraseText: { color: palette.inkSoft, fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  cardWords: { flexGrow: 1, justifyContent: 'center', gap: 4, paddingVertical: 4 },
  cardSignHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardSignHintText: { flexShrink: 1, color: palette.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.4 },
  signPanel: { flex: 1, marginTop: 6, justifyContent: 'center', overflow: 'hidden', backgroundColor: palette.canvas, borderRadius: 14, paddingHorizontal: signPanelPadding, paddingVertical: 10 },
  signPanelEmergency: { backgroundColor: palette.coralSoft },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },

  tabBar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 56 },
  tabIcon: { width: 64, height: 32, alignItems: 'center', justifyContent: 'center' },
  tabIconHighlight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: palette.brandSoft },
  tabLabel: { color: palette.muted, fontFamily: fonts.bold, fontSize: 13 },
  tabLabelSelected: { color: palette.ink },
  footer: { alignItems: 'center', gap: 8, marginTop: 32, paddingHorizontal: 24 },
  footerLogo: { width: 72, height: 40, opacity: 0.9 },
  footerText: { color: palette.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },

  signSheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 27, 61, 0.45)' },
  signSheetDismiss: { flex: 1 },
  signSheet: { overflow: 'hidden', gap: 16, paddingTop: 20, paddingHorizontal: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: palette.surface },
  signSheetStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
  signSheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  signSheetHeading: { flex: 1, gap: 4 },
  signSheetTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  signSheetSentence: { color: palette.inkSoft, fontFamily: fonts.regular, fontSize: 17, lineHeight: 23 },
  signSheetClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
  signSheetSignsWrap: { overflow: 'hidden', borderRadius: 20, backgroundColor: palette.canvas },
  signSheetSigns: { flexGrow: 0 },
  scrollHint: { alignItems: 'center', marginTop: -8 },
  hidden: { opacity: 0 },
  scrollHintPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: palette.ink },
  scrollHintText: { color: palette.white, fontFamily: fonts.bold, fontSize: 13 },
  signSheetSignsContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 12 },
  signsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 18, borderWidth: 1.5, borderColor: palette.brand, backgroundColor: palette.brandSoft },
  signsButtonText: { color: palette.brand, fontFamily: fonts.bold, fontSize: 17 },
});
