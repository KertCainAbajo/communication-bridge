// Web and Expo Go fallback: the built-in voices only exist in the Android app build.
// See builtInVoice.android.ts. Returning null makes the app use the device's own voice instead.
export type BuiltInVoice = 'fil' | 'ceb';

export async function synthesizeWithBuiltInVoice(_text: string, _voice: BuiltInVoice): Promise<string | null> {
  return null;
}

export function preloadBuiltInVoice(_voice: BuiltInVoice): void {}
