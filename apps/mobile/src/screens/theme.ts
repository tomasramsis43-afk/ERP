import { StyleSheet, useColorScheme } from 'react-native';

export interface Palette {
  bg: string; card: string; text: string; sub: string; primary: string; onPrimary: string; soft: string;
  danger: string; warn: string; success: string; border: string; ink: string; onInk: string;
}

export const LIGHT: Palette = {
  bg: '#F4F6F3', card: '#FFFFFF', text: '#14201A', sub: '#5B6B63', primary: '#0F7B5F', onPrimary: '#FFFFFF', soft: '#E3F2EC',
  danger: '#B3261E', warn: '#8A5A00', success: '#0F7B5F', border: '#DDE3DF', ink: '#14201A', onInk: '#FFFFFF',
};
export const DARK: Palette = {
  bg: '#0E1411', card: '#18211D', text: '#EAF1ED', sub: '#9DB0A6', primary: '#3BC79A', onPrimary: '#06241A', soft: '#173A2E',
  danger: '#FF8A80', warn: '#F2C265', success: '#3BC79A', border: '#27332D', ink: '#EAF1ED', onInk: '#0E1411',
};

/** Shared look: calm green and ink on a light ground (or its dark twin), 48 px touch targets, generous radii. */
export function useTheme() {
  const dark = useColorScheme() === 'dark';
  const c = dark ? DARK : LIGHT;
  const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg, padding: 16 },
    card: { backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border },
    title: { color: c.text, fontSize: 22, fontWeight: '700', marginBottom: 12 },
    text: { color: c.text, fontSize: 16 },
    sub: { color: c.sub, fontSize: 13 },
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 14, minHeight: 48, fontSize: 16, marginBottom: 10 },
    button: { backgroundColor: c.primary, borderRadius: 16, minHeight: 52, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
    buttonText: { color: c.onPrimary, fontSize: 17, fontWeight: '700' },
    ghost: { borderRadius: 14, minHeight: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, backgroundColor: c.card, marginVertical: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    error: { color: c.danger, marginVertical: 6 },
  });
  return { c, s, dark };
}
