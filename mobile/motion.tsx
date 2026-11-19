// Small, smooth animations built on React Native's own Animated API (no extra native code).
// Every animation respects the phone's "Remove animations" accessibility setting.
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// True when the user asked the phone to reduce motion; animations then show their end state at once.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

// Fades and slides its content in when it first appears (use a `key` to replay it).
export function FadeIn({ children, delay = 0, distance = 14, style }: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reduced]);

  return (
    <Animated.View
      style={[style, {
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

// Slides up and fades in while `visible`, then slides down and fades out (stays mounted meanwhile).
export function SlideUp({ visible, children, style }: { visible: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduced ? 0 : visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced, visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[style, {
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

export type ToastMessage = {
  id: number;
  kind: 'success' | 'removed' | 'info';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const toastLook = {
  success: { icon: 'checkmark-circle' as const, color: '#2E8B57' },
  removed: { icon: 'trash' as const, color: '#D2443B' },
  info: { icon: 'information-circle' as const, color: '#2A4FBF' },
};

// An alert banner that slides down from the top, stays a few seconds, then slides away.
// The app keeps `toast` until onHide is called, which happens after the slide-away finishes.
export function Toast({ toast, top, onHide }: { toast: ToastMessage | null; top: number; onHide: () => void }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!toast) return;
    progress.setValue(0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Slide in, stay 2 s, then slide away.
    Animated.timing(progress, { toValue: 1, duration: reduced ? 0 : 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      timer = setTimeout(() => {
        Animated.timing(progress, { toValue: 0, duration: reduced ? 0 : 180, easing: Easing.in(Easing.cubic), useNativeDriver: true })
          .start(() => onHide());
      }, 2000);
    });
    return () => { if (timer) clearTimeout(timer); };
  }, [onHide, progress, reduced, toast]);

  if (!toast) return null;
  const look = toastLook[toast.kind];

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.toast, {
        top,
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
      }]}
    >
      <View style={[styles.toastIcon, { backgroundColor: look.color }]}>
        <Ionicons name={look.icon} size={18} color="#FFFFFF" />
      </View>
      <Text numberOfLines={2} style={styles.toastText}>{toast.message}</Text>
      {toast.actionLabel && toast.onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => { toast.onAction?.(); onHide(); }}
          style={({ pressed }) => [styles.toastAction, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.toastActionText}>{toast.actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 18,
    backgroundColor: '#0F1B3D',
    shadowColor: '#0F1B3D',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  toastIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toastText: { flex: 1, color: '#FFFFFF', fontFamily: 'AtkinsonHyperlegible_700Bold', fontSize: 15, lineHeight: 20 },
  toastAction: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  toastActionText: { color: '#FFFFFF', fontFamily: 'AtkinsonHyperlegible_700Bold', fontSize: 14 },
});
