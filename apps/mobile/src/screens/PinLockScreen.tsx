import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { verifyPin } from '../core/pin';
import { useTheme } from './theme';

export function PinLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    if (busy) return;
    if (value.length < 4) return;
    setBusy(true);
    const ok = await verifyPin(value);
    setBusy(false);
    if (ok) onUnlock();
    else { setPin(''); Alert.alert(t('wrongPin')); }
  }

  function press(digit: string) {
    if (busy) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  return (
    <View style={st.root}>
      <View style={st.card}>
        <View style={st.icon}><Ionicons name="lock-closed" size={26} color={c.primary} /></View>
        <Text style={st.title}>{t('enterPin')}</Text>
        <View style={st.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[st.dot, i < pin.length ? st.dotOn : null]} />
          ))}
        </View>
        <View style={st.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => {
            if (k === '') return <View key={i} style={st.key} />;
            if (k === 'del') {
              return (
                <Pressable key={i} style={st.key} onPress={() => setPin((p) => p.slice(0, -1))} accessibilityRole="button">
                  <Ionicons name="backspace-outline" size={22} color={c.text} />
                </Pressable>
              );
            }
            return (
              <Pressable key={i} style={st.key} onPress={() => press(k)} accessibilityRole="button">
                <Text style={st.keyText}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// Minimal local t() shim removed; using shared i18n.


function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 320, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 24, padding: 24, alignItems: 'center' },
    icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    title: { color: c.text, fontSize: 16, fontFamily: font.extra, marginBottom: 16 },
    dots: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.border, backgroundColor: 'transparent' },
    dotOn: { backgroundColor: c.primary, borderColor: c.primary },
    keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center' },
    key: { width: 72, height: 56, margin: 4, borderRadius: 14, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    keyText: { color: c.text, fontSize: 20, fontFamily: font.extra },
  });
}
