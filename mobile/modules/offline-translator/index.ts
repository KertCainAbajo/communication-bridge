// JavaScript side of the on-device translator (Google ML Kit, Android only).
// In Expo Go and on the web the native part is missing; every function then reports "not available".
import { requireOptionalNativeModule } from 'expo';

type NativeTranslator = {
  isReady(from: string, to: string): Promise<boolean>;
  download(from: string, to: string, wifiOnly: boolean): Promise<boolean>;
  translate(text: string, from: string, to: string): Promise<string>;
};

const native = requireOptionalNativeModule<NativeTranslator>('OfflineTranslator');

// App language codes to ML Kit codes. Filipino is "tl" (Tagalog) in ML Kit.
const codes = { en: 'en', fil: 'tl' } as const;
type AppLanguage = keyof typeof codes;

export function isTranslatorAvailable(): boolean {
  return native !== null;
}

export async function isTranslatorReady(): Promise<boolean> {
  if (!native) return false;
  return native.isReady(codes.en, codes.fil).catch(() => false);
}

export async function downloadTranslator(wifiOnly: boolean): Promise<boolean> {
  if (!native) return false;
  return native.download(codes.en, codes.fil, wifiOnly);
}

// Translates offline. Returns null if the translator is missing, not downloaded, or fails.
export async function translateOffline(text: string, from: AppLanguage, to: AppLanguage): Promise<string | null> {
  if (!native || from === to) return null;
  if (!(await isTranslatorReady())) return null;
  return native.translate(text, codes[from], codes[to]).then((result) => result.trim() || null).catch(() => null);
}
