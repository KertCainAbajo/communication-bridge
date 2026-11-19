// Built-in offline voice for the Android app, used for both Filipino and Bisaya so they sound the same:
// the Piper Filipino voice (CC BY-NC-SA 4.0), run on the phone by sherpa-onnx. It ships inside the APK
// (assets/models/vits-piper-fil-v2, prepared by scripts/prepare-voice-model.py), so it needs no internet or setup.
import Storage from 'expo-sqlite/kv-store';
import { TurboModuleRegistry } from 'react-native';
import { prepareForSpeech } from './speechText';

export type BuiltInVoice = 'fil' | 'ceb';

type TtsModule = typeof import('react-native-sherpa-onnx/tts');
type FsModule = typeof import('@dr.pogodin/react-native-fs');
type TtsEngine = Awaited<ReturnType<TtsModule['createTTS']>>;

// Renamed whenever the voice files change: phones keep their first copy of a folder, so a new name
// makes them copy the new files (and resets the crash protection).
const modelFolder = 'models/vits-piper-fil-v2';

let enginePromise: Promise<TtsEngine> | null = null;
// Requests run one at a time, so the voice handles one sentence at a time.
let queue: Promise<unknown> = Promise.resolve();

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
// (loading the voice, speaking) a note is saved, and removed when the step finishes. If the app
// dies, the note is still there on the next start: the crash is counted, and a crash while
// loading removes the possibly half-copied voice. After two crashes the built-in voice is switched
// off and the phone's own voice is used, so the app never keeps crashing. New voice = fresh start.
type VoiceStep = 'load' | 'speak';
type CrashState = { folder: string; crashes: number; inProgress: VoiceStep | null; lastCrash: VoiceStep | null };

const crashNoteKey = 'communication-bridge.voice-crash.v2';
const maxCrashes = 2;
let crashStateChecked = false;

function readCrashState(): CrashState {
  const empty: CrashState = { folder: modelFolder, crashes: 0, inProgress: null, lastCrash: null };
  try {
    const saved = JSON.parse(Storage.getItemSync(crashNoteKey) ?? 'null') as CrashState | null;
    return saved?.folder === modelFolder ? saved : empty;
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
    await fs.unlink(`${fs.DocumentDirectoryPath}/${modelFolder}`).catch(() => undefined);
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
  return builtInVoiceCrashNote();
}

function builtInVoiceCrashNote(): string | null {
  const { crashes, lastCrash } = readCrashState();
  if (crashes === 0 || !lastCrash) return null;
  return `Built-in voice crashed ${crashes}x while ${lastCrash === 'load' ? 'loading' : 'speaking'}`;
}

// Progress messages for finding crashes; they appear in the Expo terminal.
function trace(message: string): void {
  console.log(`[voice] ${message}`);
}

function getEngine(tts: TtsModule): Promise<TtsEngine> {
  enginePromise ??= (async () => {
    markStep('load');
    trace('loading voice');
    const engine = await tts.createTTS({
      modelPath: { type: 'asset', path: modelFolder },
      modelType: 'vits',
      numThreads: 2,
      // Steadier and slower than the voice's defaults (0.667 / 0.8 / 1.0), so words are easier to understand.
      modelOptions: { vits: { noiseScale: 0.5, noiseScaleW: 0.6, lengthScale: speakingSlowness } },
    });
    markStep(null);
    trace('voice loaded');
    return engine;
  })();
  enginePromise.catch(() => {
    enginePromise = null;
    markStep(null); // A normal error is not a crash.
  });
  return enginePromise;
}

// How slowly the voice speaks: 1 = the voice's normal speed, higher = slower.
const speakingSlowness = 1.35;
// Silence before the first word and after the last, so the phone's player never cuts them off.
const leadingSilenceSeconds = 0.25;
const trailingSilenceSeconds = 0.5;

// Each sentence or clause is spoken separately with a clear pause after it. Every part ends with
// punctuation: without it the voice stops mid-sound and the last word is cut off.
function splitForPauses(text: string): { text: string; pauseSeconds: number }[] {
  const parts = text.match(/[^.,!?;:]+[.,!?;:]*/g) ?? [text];
  return parts
    .map((part) => part.trim())
    .filter((part) => /[a-zñ0-9]/i.test(part))
    .map((part) => (/[.,!?;:]$/.test(part) ? part : `${part}.`))
    .map((part) => ({ text: part, pauseSeconds: /[,;:]$/.test(part) ? 0.45 : 0.7 }));
}

// Softens the last 30 ms of each part so it ends without a click.
function fadeOut(samples: number[], sampleRate: number): number[] {
  const fadeLength = Math.min(samples.length, Math.round(sampleRate * 0.03));
  const faded = samples.slice();
  for (let index = 0; index < fadeLength; index += 1) {
    faded[faded.length - fadeLength + index] *= 1 - index / fadeLength;
  }
  return faded;
}

function pushSilence(samples: number[], sampleRate: number, seconds: number): void {
  for (let index = 0; index < Math.round(sampleRate * seconds); index += 1) samples.push(0);
}

// Clear speech: every word is spoken on its own with a short pause, so no word is swallowed or
// run together (the voice tends to blur words inside longer sentences). Off = natural sentences.
// Word by word, slowly: a calm pause between words, each word at the slow speaking speed.
const pauseBetweenWordsSeconds = 0.28;
const clearSpeechWordSpeed = 1;

function splitIntoWords(parts: { text: string; pauseSeconds: number }[]): { text: string; pauseSeconds: number }[] {
  return parts.flatMap((part) => {
    const words = part.text.replace(/[.,!?;:]+$/, '').split(/\s+/).filter((word) => /[a-zñ0-9]/i.test(word));
    return words.map((word, index) => ({
      text: `${word}.`,
      pauseSeconds: index === words.length - 1 ? part.pauseSeconds : pauseBetweenWordsSeconds,
    }));
  });
}

// A word spoken on its own comes with extra silence before and after it; trim that (keeping a
// 25 ms margin) so clear speech keeps a natural pace.
function trimSilence(samples: number[], sampleRate: number): number[] {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const threshold = peak * 0.04;
  let start = 0;
  let end = samples.length - 1;
  while (start < end && Math.abs(samples[start]) < threshold) start += 1;
  while (end > start && Math.abs(samples[end]) < threshold) end -= 1;
  const margin = Math.round(sampleRate * 0.025);
  return samples.slice(Math.max(0, start - margin), Math.min(samples.length, end + margin + 1));
}

// Brings every recording to the same clear volume (peak 90%) without changing how the voice sounds.
function makeStrong(samples: number[]): number[] {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return samples;
  const gain = 0.9 / peak;
  return samples.map((sample) => sample * gain);
}

// Bump when the voice settings change, so old recordings are not reused.
const recordingVersion = 'v11';

// Two independent 32-bit hashes, so different sentences never share a cached recording.
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

// Returns a file:// URI of a WAV with the spoken text, or null if the built-in voice isn't available.
// The voice is loaded on first use, not at app start, so the app always opens.
export function synthesizeWithBuiltInVoice(
  text: string,
  voice: BuiltInVoice,
  options: { clearSpeech?: boolean } = {},
): Promise<string | null> {
  const clearSpeech = options.clearSpeech ?? true;
  const modules = loadNativeModules();
  if (!modules) return Promise.resolve(null);

  const task = queue.catch(() => undefined).then(async () => {
    trace(`speak ${voice}: ${JSON.stringify(text)}`);
    await checkPreviousCrash(modules.fs);
    if (isBuiltInVoiceDisabled()) {
      trace(`built-in voice switched off (${builtInVoiceCrashNote() ?? ''})`);
      return null;
    }
    const filePath = `${modules.fs.CachesDirectoryPath}/${cacheKey(text, `${voice}-${clearSpeech ? 'clear' : 'natural'}`)}.wav`;
    if (!(await modules.fs.exists(filePath))) {
      const engine = await getEngine(modules.tts);
      markStep('speak');
      try {
        const samples: number[] = [];
        let sampleRate = engine.getSampleRate ? await engine.getSampleRate() : 22050;
        pushSilence(samples, sampleRate, leadingSilenceSeconds);
        const sentences = splitForPauses(prepareForSpeech(text, voice));
        const parts = clearSpeech ? splitIntoWords(sentences) : sentences;
        for (const part of parts) {
          trace(`generating ${JSON.stringify(part.text)}`);
          // Word by word: each word is generated on its own at the slow speaking speed.
          const audio = await engine.generateSpeech(part.text, clearSpeech ? { speed: clearSpeechWordSpeed } : undefined);
          trace(`generated ${audio.samples.length} samples at ${audio.sampleRate} Hz`);
          sampleRate = audio.sampleRate;
          const spoken = clearSpeech ? trimSilence(audio.samples, sampleRate) : audio.samples;
          for (const sample of fadeOut(spoken, sampleRate)) samples.push(sample);
          pushSilence(samples, sampleRate, part.pauseSeconds);
        }
        if (parts.length === 0) return null;
        pushSilence(samples, sampleRate, trailingSilenceSeconds);
        trace('saving recording');
        await modules.tts.saveAudioToFile({ samples: makeStrong(samples), sampleRate }, filePath);
        trace('saved');
      } finally {
        markStep(null); // Reached unless the app crashed.
      }
    }
    return `file://${filePath}`;
  });
  queue = task;
  return task;
}
