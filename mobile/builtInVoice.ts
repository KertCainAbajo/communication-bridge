// Web and Expo Go fallback: the built-in voices only exist in the Android app build.
// See builtInVoice.android.ts. Returning false makes the app use the device's own voice instead.
import type { MmsVoice } from './speechText';

export type BuiltInVoice = MmsVoice;

export async function checkBuiltInVoiceHealth(): Promise<string | null> {
  return null;
}

export function isBuiltInVoiceDisabled(): boolean {
  return false;
}

export function preloadBuiltInVoice(_voice?: BuiltInVoice): void {}

export function prepareBuiltInVoice(_text: string, _voice: BuiltInVoice, _typing?: boolean): void {}

export async function speakWithBuiltInVoiceInParts(
  _text: string,
  _voice: BuiltInVoice,
  _options: { isCancelled: () => boolean; onPart: (uri: string, isLast: boolean) => void },
): Promise<boolean> {
  return false;
}
