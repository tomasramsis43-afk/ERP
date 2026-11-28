import { StyleSheet, useColorScheme } from 'react-native';

/** Font families loaded once in App.tsx. Keeping them in the shared styles makes every screen consistent. */
export const font = {
  regular: 'Cairo_400Regular',
  medium: 'Cairo_500Medium',
  semibold: 'Cairo_600SemiBold',
  bold: 'Cairo_700Bold',
  extra: 'Cairo_800ExtraBold',
} as const;

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  const c = dark
    ? {
        bg: '#0f1115',
        card: '#1a1d24',
        text: '#f2f4f8',
        sub: '#9aa3b2',
        primary: '#37a987',
        primaryDark: '#0b5a45',
        danger: '#ff6b6b',
        border: '#2a2f3a',
        cream: '#22262e',
        soft: '#14352b',
        successSoft: '#123b2e',
        dangerSoft: '#3a1d20',
        amber: '#f0b44d',
        amberSoft: '#3a2f18',
        white: '#ffffff',
        shadow: '#000000',
      }
    : {
        bg: '#faf9f5',
        card: '#ffffff',
        text: '#10231d',
        sub: '#738077',
        primary: '#0e6b52',
        primaryDark: '#0a5a45',
        danger: '#b42318',
        border: '#e8e6df',
        cream: '#f1efe7',
        soft: '#e6f2ec',
        successSoft: '#e6f2ec',
        dangerSoft: '#fdecea',
        amber: '#9a6700',
        amberSoft: '#fff4d6',
        white: '#ffffff',
        shadow: '#10231d',
      };

  const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg, padding: 16 },
    card: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { color: c.text, fontSize: 22, fontFamily: font.bold, marginBottom: 12, letterSpacing: -0.3 },
    text: { color: c.text, fontSize: 15, fontFamily: font.regular },
    strong: { color: c.text, fontSize: 15, fontFamily: font.bold },
    sub: { color: c.sub, fontSize: 12, fontFamily: font.regular },
    input: {
      backgroundColor: c.card,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 12,
      fontSize: 15,
      fontFamily: font.regular,
      marginBottom: 10,
    },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginVertical: 6 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
    ghost: {
      borderRadius: 14,
      padding: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      marginVertical: 4,
      backgroundColor: c.card,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    error: { color: c.danger, marginVertical: 6, fontFamily: font.regular, fontSize: 12 },
    chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontFamily: font.bold },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 10 },
  });
  return { c, s, font };
}
