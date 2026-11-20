// Built-in offline voices for the Android app: Meta MMS voices for Filipino (Tagalog), Bisaya (Cebuano)
// and English (CC BY-NC 4.0), run on the phone by sherpa-onnx. They ship inside the APK
// (assets/models/vits-mms-*, made by scripts/prepare-mms-voices.py), so they need no internet or setup.
//
// Speed: speech is made in short chunks. Each chunk is saved as a small recording, so anything said
// before (and anything prepared ahead with prepareBuiltInVoice) plays at once. Only one voice is
// loaded at a time, which keeps memory low on 1 GB phones.
import Storage from 'expo-sqlite/kv-store';
import { TurboModuleRegistry } from 'react-native';
import { prepareForMms, type MmsVoice } from './speechText';

export type BuiltInVoice = MmsVoice;

type TtsModule = typeof import('react-native-sherpa-onnx/tts');
type FsModule = typeof import('@dr.pogodin/react-native-fs');
type TtsEngine = Awaited<ReturnType<TtsModule['createTTS']>>;

// Renamed whenever the voice files change: phones keep their first copy of a folder, so a new name
// makes them copy the new files (and resets the crash protection).
const modelFolders: Record<BuiltInVoice, string> = {
  fil: 'models/vits-mms-tgl',
  ceb: 'models/vits-mms-ceb',
  en: 'models/vits-mms-eng',
};
const voiceSetName = 'mms-v1';

// Loaded voices, most recently used last. Two are kept (e.g. the board language and Bisaya typed on
// the Speak screen), so switching between them does not reload; a third frees the oldest.
const maxLoadedVoices = 2;
const loaded: { voice: BuiltInVoice; engine: Promise<TtsEngine> }[] = [];
// Voice work runs one step at a time.
let queue: Promise<unknown> = Promise.resolve();
// Raised by every speak request; background preparation stops when it changes.
let speakGeneration = 0;
// Raised by every preparation request; only the newest one keeps going (older text is out of date).
let prepareGeneration = 0;
// Recordings known to exist, so speaking can start without waiting for the disk.
const knownChunks = new Set<string>();
let knownChunksRead: Promise<void> | null = null;

// Expo Go has no sherpa-onnx native code; there the app falls back to the phone's voice.
function loadNativeModules(): { tts: TtsModule; fs: FsModule } | null {
  if (!TurboModuleRegistry.get('SherpaOnnx')) return null;
  try {
    // Loaded lazily so the app still starts where the native module is missing.
    /* eslint-disable @typescript-eslint/no-require-imports */
    return {
      tts: require('react-native-sherpa-onnx/tts') as TtsModule,
      fs: require('@dr.pogodin/react-native-fs') as FsModule,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    return null;
  }
}

// Crash protection. A native crash closes the app with no message, so before each risky step
// (loading a voice, speaking) a note is saved, and removed when the step finishes. If the app
// dies, the note is still there on the next start: the crash is counted, and a crash while
// loading removes the possibly half-copied voices. After two crashes the built-in voice is switched
// off and the phone's own voice is used, so the app never keeps crashing. New voices = fresh start.
type VoiceStep = 'load' | 'speak';
type CrashState = { folder: string; crashes: number; inProgress: VoiceStep | null; lastCrash: VoiceStep | null };

const crashNoteKey = 'communication-bridge.voice-crash.v2';
const maxCrashes = 2;
let crashStateChecked = false;

function readCrashState(): CrashState {
  const empty: CrashState = { folder: voiceSetName, crashes: 0, inProgress: null, lastCrash: null };
  try {
    const saved = JSON.parse(Storage.getItemSync(crashNoteKey) ?? 'null') as CrashState | null;
    return saved?.folder === voiceSetName ? saved : empty;
  } catch {
    return empty;
  }
}

function writeCrashState(state: CrashState): void {
  try {
    Storage.setItemSync(crashNoteKey, JSON.stringify(state));
  } catch {
    // Without storage the voice still works; only the crash protection is lost.
  }
}

// Runs once per app start: a step still marked "in progress" means the app died during it.
async function checkPreviousCrash(fs: FsModule): Promise<void> {
  if (crashStateChecked) return;
  crashStateChecked = true;
  const state = readCrashState();
  if (!state.inProgress) return;
  if (state.inProgress === 'load') {
    for (const folder of Object.values(modelFolders)) {
      await fs.unlink(`${fs.DocumentDirectoryPath}/${folder}`).catch(() => undefined);
    }
  }
  writeCrashState({ ...state, crashes: state.crashes + 1, lastCrash: state.inProgress, inProgress: null });
}

function markStep(step: VoiceStep | null): void {
  writeCrashState({ ...readCrashState(), inProgress: step });
}

export function isBuiltInVoiceDisabled(): boolean {
  return readCrashState().crashes >= maxCrashes;
}

// Checks for a crash in the last run (file work only, safe at app start) and returns a note for the
// screen if the built-in voice has crashed on this phone, otherwise null.
export async function checkBuiltInVoiceHealth(): Promise<string | null> {
  const modules = loadNativeModules();
  if (!modules) return null;
  await checkPreviousCrash(modules.fs);
  const { crashes, lastCrash } = readCrashState();
  if (crashes === 0 || !lastCrash) return null;
  return `Built-in voice crashed ${crashes}x while ${lastCrash === 'load' ? 'loading' : 'speaking'}`;
}

// Progress messages for finding problems; they appear in the Expo terminal.
function trace(message: string): void {
  console.log(`[voice] ${message}`);
}

// The engine for a voice. Only one voice is kept in memory: switching language frees the other one.
function getEngine(tts: TtsModule, voice: BuiltInVoice): Promise<TtsEngine> {
  const existing = loaded.findIndex((item) => item.voice === voice);
  if (existing >= 0) {
    const [item] = loaded.splice(existing, 1);
    loaded.push(item);
    return item.engine;
  }
  const freed = loaded.length >= maxLoadedVoices ? loaded.shift() : undefined;
  const engine = (async () => {
    if (freed) await freed.engine.then((old) => old.destroy()).catch(() => undefined);
    markStep('load');
    trace(`loading ${voice}`);
    const created = await tts.createTTS({
      modelPath: { type: 'asset', path: modelFolders[voice] },
      modelType: 'vits',
      // Up to 4 processor cores (almost every phone since 2016 has at least 4).
      numThreads: 4,
      // Steadier and slightly slower than MMS's defaults (0.667 / 0.8 / 1.0): in a listening test
      // (speech recognition on every board phrase) fewer words were misheard.
      modelOptions: { vits: { noiseScale: mmsNoiseScale, noiseScaleW: mmsNoiseScaleW, lengthScale: mmsLengthScale } },
    });
    markStep(null);
    trace(`${voice} loaded`);
    return created;
  })();
  loaded.push({ voice, engine });
  engine.catch(() => {
    const index = loaded.findIndex((item) => item.engine === engine);
    if (index >= 0) loaded.splice(index, 1);
    markStep(null); // A normal error is not a crash.
  });
  return engine;
}

// Lists the recordings already on the phone (once), so they can be played without a disk check.
function readKnownChunks(fs: FsModule): Promise<void> {
  knownChunksRead ??= fs.readDir(fs.CachesDirectoryPath)
    .then((items) => {
      for (const item of items) {
        if (item.name.includes(`-${recordingVersion}-`)) knownChunks.add(item.path);
      }
    })
    .catch(() => undefined);
  return knownChunksRead;
}

// ---- Chunks ----
// Text is spoken in chunks: the first is short (heard quickly), later ones longer. A chunk ends at a
// comma or full stop, or after a few words. Chunk boundaries depend only on the words before them,
// so a sentence that grows while it is typed keeps the chunks it already had (and their recordings).
type Chunk = { text: string; pauseSeconds: number };
// Words per chunk: small at first (heard quickly; each next chunk is made while the one before plays).
const chunkSizes = [3, 5, 8];

function splitIntoChunks(text: string): Chunk[] {
  // Lower case: the voices treat capitals the same, so "Go to school" and "go to school" share recordings.
  const words = text.toLocaleLowerCase().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  const chunks: Chunk[] = [];
  let current: string[] = [];
  const flush = (pauseSeconds: number) => {
    if (current.length) chunks.push({ text: current.join(' '), pauseSeconds });
    current = [];
  };
  for (const word of words) {
    current.push(word);
    const limit = chunkSizes[Math.min(chunks.length, chunkSizes.length - 1)];
    if (/[.!?;:]$/.test(word)) flush(0.45);
    else if (/,$/.test(word)) flush(0.3);
    else if (current.length >= limit) flush(0.08);
  }
  flush(0.08);
  return chunks;
}

// Bump when the voices or chunk settings change, so old recordings are not reused.
const recordingVersion = 'mms3';

// Voice settings (keep the same as scripts/render-board-recordings.py).
const mmsNoiseScale = 0.35;
const mmsNoiseScaleW = 0.5;
const mmsLengthScale = 1.1;

// The text as given to the voice. A trailing " - -" (a pause) stops the voice adding a sound after the
// last word: the Filipino voice uses the same code for its gaps as for the letter "a", so "tubig"
// could end as "tubiga". Keep the same as scripts/render-board-recordings.py.
export function textForVoice(text: string): string {
  return `${text.replace(/[.,!?;:]+$/, '')} - -`;
}

// Two independent 32-bit hashes, so different chunks never share a recording.
function cacheKey(text: string, voice: string): string {
  let first = 0x811c9dc5;
  let second = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = (Math.imul(second, 31) + code) | 0;
  }
  return `${voice}-${recordingVersion}-${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}-${text.length}`;
}

function chunkPath(fs: FsModule, voice: BuiltInVoice, chunk: Chunk): string {
  return `${fs.CachesDirectoryPath}/${cacheKey(`${chunk.text}|${chunk.pauseSeconds}`, voice)}.wav`;
}

// Makes the recording of one chunk (if it is not saved yet) and returns its path.
async function makeChunk(modules: { tts: TtsModule; fs: FsModule }, voice: BuiltInVoice, chunk: Chunk): Promise<string> {
  const path = chunkPath(modules.fs, voice, chunk);
  if (knownChunks.has(path)) return path;
  if (await modules.fs.exists(path)) {
    knownChunks.add(path);
    return path;
  }
  const engine = await getEngine(modules.tts, voice);
  markStep('speak');
  try {
    const audio = await engine.generateSpeech(textForVoice(chunk.text));
    const rate = audio.sampleRate;
    // A little silence first (some phones cut the very start of a sound), the speech at a clear
    // volume, and the pause after. One loop into one list: this runs on the app's main JavaScript
    // thread, so it must be quick (taps wait for it).
    const spoken = audio.samples;
    let peak = 0;
    for (let index = 0; index < spoken.length; index += 1) peak = Math.max(peak, Math.abs(spoken[index]));
    const gain = peak > 0 ? 0.9 / peak : 1;
    const lead = Math.round(rate * 0.05);
    const samples = new Array<number>(lead + spoken.length + Math.round(rate * chunk.pauseSeconds)).fill(0);
    for (let index = 0; index < spoken.length; index += 1) samples[lead + index] = spoken[index] * gain;
    await modules.tts.saveAudioToFile({ samples, sampleRate: rate }, path);
    knownChunks.add(path);
  } finally {
    markStep(null); // Reached unless the app crashed.
  }
  return path;
}

function usable(): { tts: TtsModule; fs: FsModule } | null {
  const modules = loadNativeModules();
  if (!modules || isBuiltInVoiceDisabled()) return null;
  return modules;
}

// Loads a voice in the background (a few seconds on cheap phones), so speaking does not wait for it.
export function preloadBuiltInVoice(voice: BuiltInVoice = 'fil'): void {
  const modules = usable();
  if (!modules) return;
  queue = queue.catch(() => undefined).then(async () => {
    await checkPreviousCrash(modules.fs);
    await readKnownChunks(modules.fs);
    if (!isBuiltInVoiceDisabled()) await getEngine(modules.tts, voice);
  }).catch(() => undefined);
}

// Prepares the recordings of a text in the background (while it is typed, or when a word is saved),
// so speaking it later starts at once. Stops as soon as something is to be spoken.
// `typing` true: the text is still being typed. The last word may be unfinished, so it is left out,
// and only the newest text is prepared (older versions of it are out of date). A saved word (typing
// false) is always prepared in full.
export function prepareBuiltInVoice(text: string, voice: BuiltInVoice, typing = false): void {
  const modules = usable();
  if (!modules) return;
  const generation = speakGeneration;
  if (typing) prepareGeneration += 1;
  const preparation = typing ? prepareGeneration : null;
  const complete = !typing;
  const words = prepareForMms(text, voice);
  const ready = complete ? words : words.replace(/\S+$/, '').trim();
  // All chunks of the words typed so far; if more words follow, only the last chunk is remade.
  for (const chunk of splitIntoChunks(ready)) {
    queue = queue.catch(() => undefined).then(async () => {
      // Out of date: something is being spoken, or newer text is being prepared.
      if (generation !== speakGeneration || (preparation !== null && preparation !== prepareGeneration)) return;
      await checkPreviousCrash(modules.fs);
      await readKnownChunks(modules.fs);
      if (!isBuiltInVoiceDisabled()) await makeChunk(modules, voice, chunk);
    }).catch(() => undefined);
  }
}

// Speaks a text chunk by chunk: the first chunk plays as soon as it is ready (at once if it was made
// before) while the rest is made. Stops when isCancelled() says a newer text was asked for.
// Returns false if the built-in voice is not available.
export async function speakWithBuiltInVoiceInParts(
  text: string,
  voice: BuiltInVoice,
  options: { isCancelled: () => boolean; onPart: (uri: string, isLast: boolean) => void },
): Promise<boolean> {
  const modules = usable();
  if (!modules) return false;
  speakGeneration += 1;
  const chunks = splitIntoChunks(prepareForMms(text, voice));
  if (chunks.length === 0) return false;

  // Recordings that already exist play straight away: no disk check, no waiting for other voice work,
  // so the sound starts before the screen is redrawn.
  let next = 0;
  while (next < chunks.length) {
    const path = chunkPath(modules.fs, voice, chunks[next]);
    if (!knownChunks.has(path)) break;
    if (options.isCancelled()) return true;
    options.onPart(`file://${path}`, next === chunks.length - 1);
    next += 1;
  }
  if (next === chunks.length) return true;

  const task = queue.catch(() => undefined).then(async () => {
    await checkPreviousCrash(modules.fs);
    if (isBuiltInVoiceDisabled()) return next > 0;
    for (let index = next; index < chunks.length; index += 1) {
      if (options.isCancelled()) return true;
      const path = await makeChunk(modules, voice, chunks[index]);
      if (options.isCancelled()) return true;
      options.onPart(`file://${path}`, index === chunks.length - 1);
    }
    return true;
  });
  queue = task.catch(() => undefined);
  return task;
}
