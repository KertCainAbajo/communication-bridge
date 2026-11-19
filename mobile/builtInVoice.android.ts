// Built-in offline voices for the Android app: Filipino (Tagalog) and Bisaya (Cebuano),
// Meta MMS-TTS models run on the phone by sherpa-onnx. The models ship inside the APK
// (assets/models/vits-mms-*), so they need no internet and no phone setup.
import { TurboModuleRegistry } from 'react-native';
import { prepareForSpeech } from './speechText';

export type BuiltInVoice = 'fil' | 'ceb';

type TtsModule = typeof import('react-native-sherpa-onnx/tts');
type FsModule = typeof import('@dr.pogodin/react-native-fs');
type TtsEngine = Awaited<ReturnType<TtsModule['createTTS']>>;

const modelFolders: Record<BuiltInVoice, string> = {
  fil: 'models/vits-mms-tgl',
  ceb: 'models/vits-mms-ceb',
};

// Only one voice is kept in memory at a time, so the app also runs on phones with little RAM.
let activeVoice: BuiltInVoice | null = null;
let enginePromise: Promise<TtsEngine> | null = null;
// Requests run one at a time, so a voice is never closed while it is still speaking.
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

async function getEngine(tts: TtsModule, voice: BuiltInVoice): Promise<TtsEngine> {
  if (activeVoice !== voice || !enginePromise) {
    const previous = enginePromise;
    activeVoice = voice;
    enginePromise = (async () => {
      await previous?.then((engine) => engine.destroy()).catch(() => undefined);
      return tts.createTTS({
        modelPath: { type: 'asset', path: modelFolders[voice] },
        modelType: 'vits',
        numThreads: 2,
        // Steadier and slightly slower than the defaults (0.667 / 0.8 / 1.0), so words are easier to understand.
        modelOptions: { vits: { noiseScale: 0.333, noiseScaleW: 0.5, lengthScale: 1.15 } },
      });
    })();
    enginePromise.catch(() => {
      if (activeVoice === voice) {
        activeVoice = null;
        enginePromise = null;
      }
    });
  }
  return enginePromise;
}

// The voices ignore punctuation, so each sentence or clause is spoken separately with a pause after it.
function splitForPauses(text: string): { text: string; pauseSeconds: number }[] {
  const parts = text.match(/[^.,!?;:]+[.,!?;:]*/g) ?? [text];
  return parts
    .map((part) => part.trim())
    .filter((part) => /[a-zñ0-9]/i.test(part))
    .map((part) => ({ text: part, pauseSeconds: /[,;:]$/.test(part) ? 0.15 : 0.4 }));
}

// Bump when the voice settings change, so old recordings are not reused.
const recordingVersion = 'v3';

// Two independent 32-bit hashes, so different sentences never share a cached recording.
function cacheKey(text: string, voice: BuiltInVoice): string {
  let first = 0x811c9dc5;
  let second = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = (Math.imul(second, 31) + code) | 0;
  }
  return `${voice}-${recordingVersion}-${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}-${text.length}`;
}

// Loads a voice in the background so the first tap speaks quickly.
export function preloadBuiltInVoice(voice: BuiltInVoice): void {
  const modules = loadNativeModules();
  if (!modules) return;
  queue = queue.catch(() => undefined).then(() => getEngine(modules.tts, voice)).catch(() => undefined);
}

// Returns a file:// URI of a WAV with the spoken text, or null if the built-in voice isn't available.
export function synthesizeWithBuiltInVoice(text: string, voice: BuiltInVoice): Promise<string | null> {
  const modules = loadNativeModules();
  if (!modules) return Promise.resolve(null);

  const task = queue.catch(() => undefined).then(async () => {
    const filePath = `${modules.fs.CachesDirectoryPath}/${cacheKey(text, voice)}.wav`;
    if (!(await modules.fs.exists(filePath))) {
      const engine = await getEngine(modules.tts, voice);
      const samples: number[] = [];
      let sampleRate = 16000;
      for (const part of splitForPauses(prepareForSpeech(text, voice))) {
        const audio = await engine.generateSpeech(part.text);
        sampleRate = audio.sampleRate;
        for (const sample of audio.samples) samples.push(sample);
        for (let index = 0; index < Math.round(sampleRate * part.pauseSeconds); index += 1) samples.push(0);
      }
      if (samples.length === 0) return null;
      await modules.tts.saveAudioToFile({ samples, sampleRate }, filePath);
    }
    return `file://${filePath}`;
  });
  queue = task;
  return task;
}
