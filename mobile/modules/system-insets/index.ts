// Height of the phone's navigation buttons or gesture bar (Android only), in dp.
// Returns null when the native part is missing (Expo Go, web) or the screen is not ready yet.
import { requireOptionalNativeModule } from 'expo';

type NativeInsets = { bottomInset(): number };

const native = requireOptionalNativeModule<NativeInsets>('SystemInsets');

export function navigationBarHeight(): number | null {
  if (!native) return null;
  try {
    const height = native.bottomInset();
    return height > 0 ? height : null;
  } catch {
    return null;
  }
}
