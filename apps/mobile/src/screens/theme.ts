import { StyleSheet, useColorScheme } from 'react-native';

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  const c = dark
    ? { bg: '#0f1115', card: '#1a1d24', text: '#f2f4f8', sub: '#9aa3b2', primary: '#4c8dff', danger: '#ff6b6b', border: '#2a2f3a' }
    : { bg: '#f5f6f8', card: '#ffffff', text: '#16181d', sub: '#5f6877', primary: '#1f5fe0', danger: '#d92d2d', border: '#dfe2e8' };
  const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg, padding: 16 },
    card: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border },
    title: { color: c.text, fontSize: 20, fontWeight: '700', marginBottom: 12 },
    text: { color: c.text, fontSize: 16 },
    sub: { color: c.sub, fontSize: 13 },
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 10 },
    button: { backgroundColor: c.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginVertical: 6 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    ghost: { borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: c.border, marginVertical: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    error: { color: c.danger, marginVertical: 6 },
  });
  return { c, s };
}
