import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, useFonts } from '@expo-google-fonts/atkinson-hyperlegible';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import Storage from 'expo-sqlite/kv-store';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
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
import { evenLines, SignWord } from './signLanguage';
import { FadeIn, SlideUp, Toast, type ToastMessage } from './motion';
import { downloadTranslator, isTranslatorAvailable, isTranslatorReady, translateOffline } from './modules/offline-translator';
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
  // Atkinson Hyperlegible: a typeface designed for readability (low vision, early readers).
  const [fontsLoaded] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, ...Ionicons.font });
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
  const speechPlayerStatus = useAudioPlayerStatus(speechPlayer);

  // The "Speaking" bar shows while speech plays and hides 1 second after it ends
  // (or after 15 seconds at most, in case a voice never reports that it finished).
  const [speakingVisible, setSpeakingVisible] = useState(false);
  // Hour of the day for the greeting (read once when the app opens).
  const [greetingHour] = useState(() => new Date().getHours());
  // The last sentences spoken from the Speak screen, to say again with one tap.
  const [recentlySaid, setRecentlySaid] = useState<string[]>([]);
  // Two screens: the communication board and the "Speak anything" typing screen.
  const [activeTab, setActiveTab] = useState<'board' | 'speak'>('board');
  const speakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideSpeakingAfter = (milliseconds: number) => {
    if (speakingTimer.current) clearTimeout(speakingTimer.current);
    speakingTimer.current = setTimeout(() => setSpeakingVisible(false), milliseconds);
  };
  const showSpeaking = () => {
    setSpeakingVisible(true);
    hideSpeakingAfter(15000);
  };
  const speechFinished = () => hideSpeakingAfter(300);

  useEffect(() => {
    if (speechPlayerStatus.didJustFinish) speechFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechPlayerStatus.didJustFinish]);

  useEffect(() => () => {
    if (speakingTimer.current) clearTimeout(speakingTimer.current);
  }, []);
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

  // Speaks with the first phone voice in the list. Phones often list voices that are not downloaded;
  // Android then reports an error, and the next voice in the list is used, so speech never stays silent.
  const speakWithPhoneVoices = async (attempts: { text: string; aliases: string[] }[]): Promise<boolean> => {
    const voices = await Speech.getAvailableVoicesAsync();
    const options = attempts.flatMap((attempt) => {
      const voice = findDeviceVoice(voices, attempt.aliases);
      return voice ? [{ text: attempt.text, voice }] : [];
    });
    if (options.length === 0) return false;

    const speakOption = (index: number) => {
      const { text, voice } = options[index];
      Speech.speak(text, {
        language: voice.language,
        voice: voice.identifier,
        rate: 0.88,
        pitch: 1.02,
        onDone: speechFinished,
        onStopped: speechFinished,
        onError: () => {
          if (index + 1 < options.length) speakOption(index + 1);
          else {
            setSpeechError('The phone voice could not speak this text.');
            speechFinished();
          }
        },
      });
    };
    await Speech.stop();
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
    setSpeechError(null);
    setLastSpoken(text);
    showSpeaking();

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
      if (languageCode !== 'en' && Platform.OS === 'android') {
        // Filipino and Bisaya, best voice first:
        // 1. the phone's Google Filipino voice (natural), if chosen;
        // 2. Google's Indonesian voice, which reads Filipino spelling with nearly the right sounds
        //    (a e i o u, hard g, ng);
        // 3. the English voice, which every phone has.
        const spokenText = prepareForEnglishVoice(text, languageCode);
        const attempts = [
          ...(filipinoVoice === 'phone' ? [{ text, aliases: speechLanguageAliases.fil }] : []),
          { text: spokenText, aliases: indonesianVoiceAliases },
          { text: spokenText, aliases: speechLanguageAliases.en },
        ];
        if (await speakWithPhoneVoices(attempts)) return;
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
      if (await speakWithPhoneVoices([{ text, aliases: speechLanguageAliases[languageCode] }])) return;

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
    if (!phrase) return;
    speakText(phrase, detectSpeechVoice(phrase, language));
    setRecentlySaid((previous) => [phrase, ...previous.filter((item) => item !== phrase)].slice(0, 6));
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
      const categoryName = customCategories.find((category) => category.id === word.categoryId)?.name
        ?? categories.find((category) => category.slug === word.categoryId)?.name;
      showToast('success', `Saved “${wordTextIn(word, language) ?? word.text}”${categoryName ? ` to ${categoryName}` : ''}`);
    } catch {
      setCustomWordError('Could not save this word on the device. Try again.');
    }
  };

  const discardPendingWord = (id: string) => {
    const discarded = pendingWords.find((word) => word.id === id);
    setPendingWords((words) => words.filter((word) => word.id !== id));
    setCustomWordError(null);
    if (discarded) showToast('info', `Discarded “${discarded.text}”`);
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
      showToast('success', `Restored “${wordTextIn(word, language) ?? word.text}”`);
    } catch {
      setCustomWordError('Could not restore this word on the device. Try again.');
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
        showToast('removed', `Removed “${wordTextIn(removed, language) ?? removed.text}”`, {
          actionLabel: 'Undo',
          onAction: () => void restoreCustomWord(removed),
        });
      }
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
      showToast('success', `Category “${name}” created`);
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
      setLocalActionError(null);
      showToast('removed', `Removed “${message.title ?? message.message_text ?? 'phrase'}”`, {
        actionLabel: 'Undo',
        onAction: () => void undoHideMessage(message),
      });
    } catch {
      setLocalActionError('Could not remove that message from this device.');
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
      showToast('success', `Restored “${message.title ?? message.message_text ?? 'phrase'}”`);
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
  const draftLanguageLabel = voiceLabels[detectSpeechVoice(speechDraft, language)];
  const selectedCategoryName = selectedCategory?.startsWith(customCategoryPrefix)
    ? customCategories.find((category) => category.id === selectedCategory)?.name ?? 'Custom category'
    : categories.find((category) => category.slug === selectedCategory)?.name ?? null;

  const columnWidth: `${number}%` = width >= 900 ? '31.5%' : '48%';
  const cardWidth = Math.round((width - 32) * (width >= 900 ? 0.315 : 0.48));
  const categoryColor = (slug: string | undefined) => categories.find((category) => category.slug === slug)?.color ?? palette.sky;
  const accentFor = useStableCallback((message: CommunicationMessage) =>
    message.is_emergency ? palette.coral : categoryColor(message.category?.slug));
  const speakMessage = useStableCallback((message: CommunicationMessage) => speak(message));
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {/* Header: brand row, greeting, language */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoTile}>
              <Image
                accessibilityLabel="Communication Bridge logo"
                source={require('./assets/logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.brandCopy}>
              <Text style={styles.brandName}>Communication Bridge</Text>
              <View style={styles.statusLine}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Offline · Ready</Text>
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
                    style={[styles.languageOption, active && styles.languageOptionActive]}
                  >
                    <Text style={[styles.languageOptionText, active && styles.languageOptionTextActive]}>
                      {item.code === 'en' ? 'EN' : 'FIL'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.greeting}>
            <Text style={styles.greetingEyebrow}>{greetingFor(greetingHour, language)}</Text>
            <Text accessibilityRole="header" style={styles.greetingTitle}>
              {language === 'fil' ? 'Ano ang gusto mong sabihin?' : 'What would you like to say?'}
            </Text>
          </View>
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
            <Text accessibilityRole="header" style={styles.sectionTitle}>Speak anything</Text>
            <Text style={styles.sectionSubtitle}>Type in English, Filipino or Bisaya, then tap Speak.</Text>
          </View>

          {/* Writing pad */}
          <View style={styles.pad}>
            <TextInput
              accessibilityLabel="Type text to speak"
              multiline
              maxLength={1000}
              placeholder="Type what you want to say…"
              placeholderTextColor={palette.placeholder}
              value={speechDraft}
              onChangeText={setSpeechDraft}
              style={styles.padInput}
            />
            <View style={styles.padToolbar}>
              {speechDraft.trim() ? (
                <View style={styles.voicePill}>
                  <Ionicons name="volume-medium" size={14} color={palette.brand} />
                  <Text style={styles.voicePillText}>{draftLanguageLabel} voice</Text>
                </View>
              ) : (
                <Text style={styles.padHint}>The voice is chosen for you</Text>
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
                  <Text style={styles.clearButtonText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Speak typed text in ${draftLanguageLabel}`}
            accessibilityState={{ disabled: speechLoading || !speechDraft.trim() }}
            disabled={speechLoading || !speechDraft.trim()}
            onPress={speakDraft}
            style={({ pressed }) => [styles.speakButton, (speechLoading || !speechDraft.trim()) && styles.speakButtonDisabled, pressed && styles.tilePressed]}
          >
            {speechLoading
              ? <ActivityIndicator color={palette.white} size="small" />
              : <Ionicons name="volume-high" size={22} color={speechDraft.trim() ? palette.white : palette.muted} />}
            <Text style={[styles.speakButtonText, !speechDraft.trim() && styles.speakButtonTextDisabled]}>Speak</Text>
          </Pressable>
          {speechError ? <Text accessibilityRole="alert" style={styles.errorText}>{speechError}</Text> : null}

          {/* Recently said */}
          {recentlySaid.length > 0 ? (
            <View style={styles.recentBlock}>
              <View style={styles.quickHeader}>
                <Text style={styles.sectionLabel}>RECENTLY SAID</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear all recently said"
                  hitSlop={8}
                  onPress={() => {
                    const cleared = recentlySaid;
                    setRecentlySaid([]);
                    showToast('removed', 'Cleared recently said', { actionLabel: 'Undo', onAction: () => setRecentlySaid(cleared) });
                  }}
                  style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
                >
                  <Ionicons name="trash-outline" size={15} color={palette.inkSoft} />
                  <Text style={styles.clearButtonText}>Clear all</Text>
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

          {/* Voice for Filipino and Bisaya */}
          {Platform.OS === 'android' ? (
            <View style={styles.voiceRow}>
              <View style={styles.voiceRowCopy}>
                <Text style={styles.voiceRowTitle}>Filipino &amp; Bisaya voice</Text>
                <Text style={styles.voiceRowHint}>
                  {filipinoVoice === 'phone' ? 'Natural Filipino voice of the phone' : 'Clear voice that works on every phone'}
                </Text>
              </View>
              <View style={styles.languageSwitch}>
                {([['phone', 'Phone'], ['builtin', 'Built-in']] as const).map(([choice, label]) => {
                  const active = filipinoVoice === choice;
                  return (
                    <Pressable
                      key={choice}
                      accessibilityRole="radio"
                      accessibilityLabel={choice === 'phone' ? 'Filipino voice' : 'Clear voice'}
                      accessibilityState={{ selected: active }}
                      onPress={() => chooseFilipinoVoice(choice)}
                      style={[styles.languageOption, active && styles.languageOptionActive]}
                    >
                      <Text style={[styles.languageOptionText, active && styles.languageOptionTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={14} color={palette.muted} />
            <Text style={styles.privacyText}>Works without internet. Your text never leaves this phone.</Text>
          </View>
          {/* Credits required by the licences of the bundled voice and hand drawings. */}
          <Text style={styles.creditsText}>
            Built-in voice: Piper Filipino by IhorShevchuk (CC BY-NC-SA 4.0). Hand sign drawings: Wikimedia Commons (public domain).
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
            placeholder="Search words or phrases"
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
          <Text accessibilityRole="header" style={styles.sectionTitle}>Categories</Text>
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
              <Text style={styles.addCategoryText}>New</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <CategoryChip
            label="All"
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
          <View style={styles.inlineForm}>
            <TextInput
              accessibilityLabel="New category name"
              placeholder="Name your category"
              placeholderTextColor={palette.placeholder}
              value={customCategoryInput}
              onChangeText={(text) => { setCustomCategoryInput(text); setCustomCategoryError(null); }}
              onSubmitEditing={() => void saveCustomCategory()}
              returnKeyType="done"
              maxLength={40}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!customWordsReady || !customCategoryInput.trim()}
              onPress={() => void saveCustomCategory()}
              style={[styles.primarySmall, (!customWordsReady || !customCategoryInput.trim()) && styles.speakButtonDisabled]}
            >
              <Text style={styles.primarySmallText}>Create</Text>
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
                <Text accessibilityRole="header" style={styles.cardTitle}>{selectedCategoryName ? `Add to ${selectedCategoryName}` : 'Your words'}</Text>
                <Text style={styles.cardSubtitle}>{`${savedWordsForLanguage.length} saved · translated to English and Filipino`}</Text>
              </View>
            </View>
            <View style={styles.inlineForm}>
              <TextInput
                accessibilityLabel="Add a word or phrase to the selected category"
                editable={customWordsReady}
                placeholder="Type a word or phrase"
                placeholderTextColor={palette.placeholder}
                value={customWordInput}
                onChangeText={(text) => { setCustomWordInput(text); setCustomWordError(null); }}
                onSubmitEditing={addPendingWord}
                returnKeyType="done"
                maxLength={100}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add word to ${selectedCategoryName ?? 'selected category'}`}
                disabled={!customWordsReady || !customWordInput.trim()}
                onPress={addPendingWord}
                style={[styles.primarySmall, (!customWordsReady || !customWordInput.trim()) && styles.speakButtonDisabled]}
              >
                <Text style={styles.primarySmallText}>Add</Text>
              </Pressable>
            </View>
            {customWordError ? <Text style={styles.errorText}>{customWordError}</Text> : null}
            {pendingWordsForLanguage.length > 0 ? (
              <View style={styles.pendingList}>
                <Text style={styles.sectionLabel}>CHECK AND SAVE</Text>
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
                          style={styles.translationInput}
                        />
                      </View>
                    ))}
                    {translatingWordIds.includes(word.id) ? (
                      <View style={styles.hintRow}>
                        <ActivityIndicator size="small" color={palette.brand} />
                        <Text style={styles.hintText}>Translating…</Text>
                      </View>
                    ) : word.machineTranslated ? (
                      <View style={styles.hintRow}>
                        <Ionicons name="sparkles" size={14} color={palette.brand} />
                        <Text style={styles.hintText}>Translated automatically. Please check it is right.</Text>
                      </View>
                    ) : word.needsTranslationCheck ? (
                      <Text style={styles.warningText}>
                        No automatic translation found. Names and food often stay the same; otherwise type the translation above.
                        {translatorStatus === 'missing' || translatorStatus === 'failed' ? (
                          <>
                            {' '}
                            <Text style={styles.linkText} onPress={() => void downloadTranslatorNow()}>Download translator</Text>
                            {translatorStatus === 'failed'
                              ? ' (needs internet once, about 30 MB; please connect and try again).'
                              : ' (once, about 30 MB) to translate any sentence offline.'}
                          </>
                        ) : null}
                        {translatorStatus === 'downloading' ? ' Downloading translator…' : null}
                      </Text>
                    ) : null}
                    <View style={styles.pendingActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete unsaved ${word.text}`}
                        onPress={() => discardPendingWord(word.id)}
                        style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.ghostButtonText}>Discard</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Save ${word.text} to ${customCategories.find((category) => category.id === word.categoryId)?.name ?? categories.find((category) => category.slug === word.categoryId)?.name ?? 'category'}`}
                        onPress={() => void saveCustomWord(word)}
                        style={({ pressed }) => [styles.primarySmall, pressed && styles.pressed]}
                      >
                        <Ionicons name="checkmark" size={18} color={palette.white} />
                        <Text style={styles.primarySmallText}>Save</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>Add a word, check the translation, then save. It appears on the board below with its hand signs.</Text>
            )}
          </View>
        ) : null}

        {/* Communication board */}
        <View style={styles.sectionHeader}>
          <View>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{selectedCategoryName ?? 'Communication board'}</Text>
            <Text style={styles.sectionSubtitle}>{`${visibleMessages.length} phrases · tap a card to speak`}</Text>
          </View>
        </View>

        {localActionError ? <Text style={styles.errorText}>{localActionError}</Text> : null}
        {syncNotice ? <Text style={styles.helperText}>{syncNotice}</Text> : null}

        {visibleMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name="search" size={28} color={palette.brand} /></View>
            <Text style={styles.emptyTitle}>No phrases found</Text>
            <Text style={styles.helperText}>Try another word or choose a different category.</Text>
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
          />
        )}

        <View style={styles.footer}>
          <Image source={require('./assets/logo.png')} style={styles.footerLogo} resizeMode="contain" />
          <Text style={styles.footerText}>Your words stay on this phone, ready whenever you need them.</Text>
        </View>
        </FadeIn>
        ) : null}
      </ScrollView>


      {/* Brand-coloured strip behind the phone's status bar, so scrolled content never sits under the clock. */}
      <View pointerEvents="none" style={styles.statusBarShade} />

      {/* Now speaking */}
      {lastSpoken ? (
        <SlideUp visible={speakingVisible} style={styles.nowSpeaking}>
          <View style={styles.nowSpeakingAccent} />
          <View style={styles.nowSpeakingIcon}>
            <Ionicons name="volume-high" size={20} color={palette.brand} />
          </View>
          <View style={styles.nowSpeakingCopy}>
            <Text style={styles.nowSpeakingLabel}>Now speaking</Text>
            <Text numberOfLines={2} style={styles.nowSpeakingText}>{lastSpoken}</Text>
          </View>
        </SlideUp>
      ) : null}

      <TabBar active={activeTab} onChange={setActiveTab} />

      <Toast toast={toast} top={(RNStatusBar.currentHeight ?? 24) + 12} onHide={hideToast} />
    </View>
  );
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
  accentFor: (message: CommunicationMessage) => string;
  onSpeak: (message: CommunicationMessage) => void;
  onRemove: (message: CommunicationMessage) => void;
};

// Renders the first cards at once and the rest in small batches just after, so the board opens
// instantly even with many phrases. Remounts (via key) when the category or language changes.
const firstBatch = 12;
const BoardList = memo(function BoardList({ messages, columnWidth, cardWidth, accentFor, onSpeak, onRemove }: CardHandlers & {
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

  // Cards are placed in separate columns (each card goes to the shortest one), so every card is only
  // as tall as its own content: no stretched cards with empty space.
  const columnCount = columnWidth === '48%' ? 2 : 3;
  const columns = useMemo(() => {
    const lists: { message: CommunicationMessage; index: number }[][] = Array.from({ length: columnCount }, () => []);
    const heights = new Array<number>(columnCount).fill(0);
    messages.slice(0, renderCount).forEach((message, index) => {
      const shortest = heights.indexOf(Math.min(...heights));
      lists[shortest].push({ message, index });
      heights[shortest] += estimateCardHeight(message, cardWidth) + 14;
    });
    return lists;
  }, [messages, renderCount, columnCount, cardWidth]);

  return (
    <View style={styles.board}>
      {columns.map((column, columnIndex) => (
        <View key={columnIndex} style={styles.boardColumn}>
          {column.map(({ message, index }) => (
            <PhraseCard
              key={message.uuid}
              message={message}
              index={index}
              columnWidth="100%"
              cardWidth={cardWidth}
              accentFor={accentFor}
              onSpeak={onSpeak}
              onRemove={onRemove}
            />
          ))}
        </View>
      ))}
    </View>
  );
});

// A rough card height (in dp) from its text and hand signs, used only to keep the columns even.
function estimateCardHeight(message: CommunicationMessage, cardWidth: number): number {
  const inner = cardWidth - 2 * 14;
  const title = message.title ?? message.message_text ?? '';
  const titleLines = Math.max(1, Math.ceil((title.length * 11) / Math.max(40, inner - 50)));
  let height = 2 * 14 + titleLines * 24 + (message.is_emergency ? 18 : 0);
  if (message.title && message.message_text && message.message_text !== message.title) {
    height += 10 + Math.min(3, Math.ceil((message.message_text.length * 8.5) / inner)) * 22;
  }
  const signWidth = inner - 2 * 8;
  const size = signSizeFor(title, signWidth);
  const perLine = signLettersPerLine(signWidth, size);
  const signRows = title.split(/\s+/)
    .map((word) => [...word.replace(/[^a-zñ]/gi, '')])
    .filter((letters) => letters.length > 0)
    .reduce((rows, letters) => rows + evenLines(letters, perLine).length, 0);
  if (signRows > 0) height += 10 + 20 + signRows * (size + Math.round(size * 0.36) * 1.4 + 6);
  return height + 10 + 36;
}

// How many hand signs of this size fit on one line of the card.
function signLettersPerLine(availableWidth: number, size: number): number {
  return Math.max(1, Math.floor((availableWidth + 2) / (size + 2)));
}

// Hand-sign size so the longest word fits on one line of the card (words wrap only between words).
function signSizeFor(text: string, availableWidth: number): number {
  const longestWord = Math.max(1, ...text.split(/\s+/).map((word) => word.replace(/[^a-zñ]/gi, '').length));
  // Big, clear hands: at most 3 letters per line, and longer words split into even lines
  // (HEL/LO, HUN/GRY, QUE/ST/ION) so no letter sits alone on a line.
  const lines = Math.ceil(longestWord / 3);
  const lettersPerLine = Math.ceil(longestWord / lines);
  return Math.max(30, Math.min(52, Math.floor(availableWidth / lettersPerLine) - 4));
}

// A soft tint of a category colour (for the category tag).
function tint(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}1F` : palette.canvas;
}

// One phrase card; only redraws when its own phrase changes. Tapping anywhere on it speaks.
const PhraseCard = memo(function PhraseCard({ message, index, columnWidth, cardWidth, accentFor, onSpeak, onRemove }: CardHandlers & {
  message: CommunicationMessage;
  index: number;
  columnWidth: `${number}%`;
  cardWidth: number;
}) {
  const accent = accentFor(message);
  const title = message.title ?? message.message_text ?? '';
  const spokenText = message.message_text ?? message.title ?? 'message';
  const signWidth = cardWidth - 2 * 14 - 2 * 8;
  const signSize = signSizeFor(title, signWidth);
  return (
    <FadeIn delay={Math.min(index, 8) * 45} style={{ width: columnWidth }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Speak: ${spokenText}`}
        onPress={() => onSpeak(message)}
        style={({ pressed }) => [styles.phraseCard, message.is_emergency && styles.phraseCardEmergency, pressed && styles.cardPressed]}
      >
        <View style={styles.phraseHead}>
          <View style={styles.phraseHeadCopy}>
            {message.is_emergency ? (
              <View style={styles.emergencyTag}>
                <Ionicons name="alert-circle" size={12} color={palette.coral} />
                <Text style={styles.emergencyTagText}>EMERGENCY</Text>
              </View>
            ) : null}
            <Text style={styles.phraseTitle}>{title}</Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.speakBadge, { backgroundColor: accent }]}>
            <Ionicons name="volume-high" size={18} color={palette.white} />
          </View>
        </View>
        {message.title && message.message_text !== message.title ? (
          <Text numberOfLines={3} style={styles.phraseText}>{message.message_text}</Text>
        ) : null}

        {/* The card's word in sign language (fingerspelled), made automatically for any word. */}
        <View style={[styles.signPanel, message.is_emergency && styles.signPanelEmergency]}>
          <SignWord text={title} size={signSize} maxPerLine={signLettersPerLine(signWidth, signSize)} />
        </View>

        <View style={styles.phraseFooter}>
          <View style={[styles.categoryTag, { backgroundColor: message.is_emergency ? palette.coralSoft : tint(accent) }]}>
            <View style={[styles.categoryDot, { backgroundColor: accent }]} />
            <Text numberOfLines={1} style={styles.categoryTagText}>{message.category?.name ?? 'Message'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${spokenText} from this phone`}
            hitSlop={6}
            onPress={() => onRemove(message)}
            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={17} color={palette.muted} />
          </Pressable>
        </View>
      </Pressable>
    </FadeIn>
  );
});

// Room for Android's navigation/gesture bar below the tab bar (no native safe-area module needed).
function bottomSystemBarHeight(): number {
  const screen = Dimensions.get('screen').height;
  const window = Dimensions.get('window').height;
  const statusBar = RNStatusBar.currentHeight ?? 0;
  return Math.max(16, Math.min(48, Math.round(screen - window - statusBar)));
}

function TabBar({ active, onChange }: { active: 'board' | 'speak'; onChange: (tab: 'board' | 'speak') => void }) {
  const tabs = [
    { key: 'board' as const, label: 'Board', icon: 'grid' as const, iconOutline: 'grid-outline' as const },
    { key: 'speak' as const, label: 'Speak', icon: 'chatbubble-ellipses' as const, iconOutline: 'chatbubble-ellipses-outline' as const },
  ];
  return (
    <View accessibilityRole="tablist" style={[styles.tabBar, { paddingBottom: bottomSystemBarHeight() }]}>
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

// Design tokens. Brand colours come from the Communication Bridge logo; text colours meet 4.5:1 contrast.
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
  logoTile: { width: 52, height: 52, borderRadius: 16, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  brandLogo: { width: 44, height: 28 },
  brandCopy: { flex: 1, gap: 3 },
  brandName: { color: palette.ink, fontFamily: fonts.bold, fontSize: 16, letterSpacing: -0.2 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.green },
  statusText: { color: palette.muted, fontFamily: fonts.regular, fontSize: 13 },
  languageSwitch: { flexDirection: 'row', backgroundColor: palette.white, borderRadius: 14, borderWidth: 1, borderColor: palette.line, padding: 3 },
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
  voicePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  voicePillText: { color: palette.brand, fontFamily: fonts.bold, fontSize: 13 },
  characterCount: { marginLeft: 'auto', color: palette.muted, fontFamily: fonts.regular, fontSize: 13 },
  speakButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 60, borderRadius: 20, backgroundColor: palette.brand, ...cardShadow },
  speakButtonDisabled: { backgroundColor: '#E4E0D8', shadowOpacity: 0, elevation: 0 },
  speakButtonText: { color: palette.white, fontFamily: fonts.bold, fontSize: 20 },
  speakButtonTextDisabled: { color: palette.muted },
  speakSection: { paddingHorizontal: 16, marginTop: 24, gap: 14 },
  pad: { backgroundColor: palette.surface, borderRadius: 24, borderWidth: 1, borderColor: palette.line, ...cardShadow },
  padInput: { minHeight: 210, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, color: palette.ink, fontFamily: fonts.regular, fontSize: 24, lineHeight: 32, textAlignVertical: 'top' },
  padToolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.line },
  padHint: { flex: 1, color: palette.muted, fontFamily: fonts.regular, fontSize: 13 },
  clearButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: palette.canvas },
  clearButtonText: { color: palette.inkSoft, fontFamily: fonts.bold, fontSize: 13 },
  recentBlock: { gap: 8 },
  recentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  recentChipText: { flexShrink: 1, color: palette.ink, fontFamily: fonts.bold, fontSize: 15 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  voiceRowCopy: { flex: 1, gap: 2 },
  voiceRowTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 15 },
  voiceRowHint: { color: palette.muted, fontFamily: fonts.regular, fontSize: 12 },
  voiceChoice: { gap: 8 },
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
  translationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  translationLabelButton: { width: 92, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  translationLabel: { color: palette.brand, fontFamily: fonts.bold, fontSize: 14 },
  translationInput: { flex: 1, minWidth: 0, minHeight: 44, backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, color: palette.ink, fontFamily: fonts.regular, fontSize: 16 },
  pendingActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },

  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  noticeText: { flex: 1, color: palette.inkSoft, fontFamily: fonts.regular, fontSize: 14 },
  noticeAction: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: palette.brandSoft, justifyContent: 'center' },
  noticeActionText: { color: palette.brand, fontFamily: fonts.bold, fontSize: 14 },

  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 18 },

  board: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16 },
  boardColumn: { flex: 1, gap: 14 },
  phraseCard: { backgroundColor: palette.surface, borderRadius: 24, padding: 14, gap: 10, borderWidth: 1, borderColor: palette.line, ...cardShadow },
  phraseCardEmergency: { backgroundColor: '#FFF7F5', borderColor: '#F5CDC8' },
  cardPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  phraseHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  phraseHeadCopy: { flex: 1, gap: 4 },
  speakBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emergencyTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emergencyTagText: { color: palette.coral, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1 },
  phraseTitle: { color: palette.ink, fontFamily: fonts.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.3 },
  phraseText: { color: palette.inkSoft, fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  signPanel: { backgroundColor: palette.canvas, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 10 },
  signPanelEmergency: { backgroundColor: palette.coralSoft },
  phraseFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' },
  categoryTag: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryTagText: { flexShrink: 1, color: palette.inkSoft, fontFamily: fonts.bold, fontSize: 12 },
  removeButton: { marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

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

  nowSpeaking: { position: 'absolute', left: 16, right: 16, bottom: 8 + 56 + 1 + 12 + bottomSystemBarHeight(), flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 18, paddingRight: 16, overflow: 'hidden', borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, ...cardShadow, elevation: 8 },
  nowSpeakingAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: palette.brand },
  nowSpeakingIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center' },
  nowSpeakingCopy: { flex: 1, gap: 1 },
  nowSpeakingLabel: { color: palette.brand, fontFamily: fonts.bold, fontSize: 12 },
  nowSpeakingText: { color: palette.ink, fontFamily: fonts.bold, fontSize: 17 },
});
