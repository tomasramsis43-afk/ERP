import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { stepQuantity } from '../core/qty';
import { useTheme } from '../screens/theme';

const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  people: 'M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  box: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
  more: '',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M20 20l-4.2-4.2',
  scan: 'M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 9v6M12 9v6M16 9v6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  chat: 'M4 5h16v11H9l-5 4z',
  back: 'M9 6l6 6-6 6',
  check: 'M5 13l4 4L19 7',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  cash: 'M3 7h18v10H3zM12 9.5v5M9.5 12h5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  van: 'M2 16V7h11v9M13 10h4l4 3v3h-2M2 16h2M9 16h4M19 16h2',
  sync: 'M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l11-3v3M16 13.5h2',
  close: 'M6 6l12 12M18 6L6 18',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  globe: 'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  logout: 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  userPlus: 'M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {name === 'more' ? (
        <>
          <Circle cx={5} cy={12} r={1.5} fill={color} />
          <Circle cx={12} cy={12} r={1.5} fill={color} />
          <Circle cx={19} cy={12} r={1.5} fill={color} />
        </>
      ) : (
        <>
          {name === 'home' || name === 'people' || name === 'search' || name === 'phone' ? null : null}
          {name === 'people' ? <Circle cx={9} cy={8} r={3.5} /> : null}
          {name === 'search' ? <Circle cx={11} cy={11} r={6.5} /> : null}
          {name === 'globe' ? <Circle cx={12} cy={12} r={9} /> : null}
          <Path d={PATHS[name]} />
        </>
      )}
    </Svg>
  );
}

type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { c } = useTheme();
  const fg = tone === 'ok' ? c.success : tone === 'warn' ? c.warn : tone === 'danger' ? c.danger : c.sub;
  return (
    <View style={{ backgroundColor: `${fg}1F`, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Btn({ label, onPress, kind = 'primary', icon, disabled, flex }: { label: string; onPress: () => void; kind?: 'primary' | 'ink' | 'outline'; icon?: IconName; disabled?: boolean; flex?: number }) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.primary : kind === 'ink' ? c.ink : c.card;
  const fg = kind === 'primary' ? c.onPrimary : kind === 'ink' ? c.onInk : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{ flex, minHeight: 52, borderRadius: 16, backgroundColor: bg, borderWidth: kind === 'outline' ? 1 : 0, borderColor: c.border, opacity: disabled ? 0.45 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 }}
    >
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function IconBtn({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color?: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: 48, height: 48, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={22} color={color ?? c.text} />
    </Pressable>
  );
}

/** + / − buttons around an editable quantity. */
export function Stepper({ value, onChange, onRemove }: { value: string; onChange: (v: string) => void; onRemove: () => void }) {
  const { c } = useTheme();
  const step = (d: 1 | -1) => {
    const next = stepQuantity(value, d);
    if (next === null) onRemove();
    else onChange(next);
  };
  const box = { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="-" style={[box, { backgroundColor: c.card }]}>
        <Icon name="minus" size={20} color={c.text} />
      </Pressable>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" accessibilityLabel="quantity" style={{ minWidth: 48, textAlign: 'center', fontSize: 17, fontWeight: '700', color: c.text, padding: 0 }} />
      <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="+" style={[box, { backgroundColor: c.primary, borderColor: c.primary }]}>
        <Icon name="plus" size={20} color={c.onPrimary} />
      </Pressable>
    </View>
  );
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={28} color={c.primary} />
      </View>
      <Text style={{ color: c.sub, fontSize: 15, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

/** Grey bars that breathe while local data loads. */
export function Skeleton({ rows = 3, height = 64 }: { rows?: number; height?: number }) {
  const { c } = useTheme();
  const o = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.45, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return (
    <View style={{ gap: 10 }} accessibilityLabel="loading">
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={{ height, borderRadius: 16, backgroundColor: c.border, opacity: o }} />
      ))}
    </View>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
      {onBack ? <IconBtn icon="back" label="back" onPress={onBack} /> : null}
      <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 20, fontWeight: '700' }}>{title}</Text>
      {right}
    </View>
  );
}
