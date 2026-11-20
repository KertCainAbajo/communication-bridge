// Fast phone-voice speech for Android (see FastSpeechModule.kt). Returns null in Expo Go and on the
// web, where the app falls back to expo-speech.
import { requireOptionalNativeModule } from 'expo';

export type FastVoice = { identifier: string; language: string; networkRequired: boolean; notInstalled: boolean };
type SpeechEvent = { id: string };
type EventName = 'onStart' | 'onDone' | 'onStop' | 'onError';

type NativeFastSpeech = {
  getVoices(): Promise<FastVoice[]>;
  speak(id: string, text: string, voice: string | null, language: string | null, rate: number, pitch: number): Promise<void>;
  stop(): Promise<void>;
  ensureReady(): Promise<void>;
  addListener(event: EventName, listener: (event: SpeechEvent) => void): { remove(): void };
};

export const fastSpeech = requireOptionalNativeModule<NativeFastSpeech>('FastSpeech');
