import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { clearPin, hasPin, setPin, verifyPin } from '../core/pin';
import { t } from '../i18n';
import { useTheme } from './theme';

export function PinSetupScreen({ onDone }: { onDone: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [has, setHas] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { void hasPin().then(setHas); }, []);

  async function save() {
    if (saving) return;
    if (!/^\d{4}$/.test(next)) return Alert.alert(t('setPin'), 'PIN must be 4 digits');
    if (next !== confirm) return Alert.alert(t('setPin'), 'PINs do not match');
    setSaving(true);
    try {
      if (has) {
        if (!/^\d{4}$/.test(current)) { setSaving(false); return Alert.alert(t('wrongPin')); }
        const ok = await verifyPin(current);
        if (!ok) { setSaving(false); return Alert.alert(t('wrongPin')); }
      }
      await setPin(next);
    } catch {
      setSaving(false);
      return Alert.alert(t('opFailed'));
    }
    setSaving(false);
    Alert.alert(t('pinSet'));
    onDone();
  }

  async function remove() {
    if (saving) return;
    if (has) {
      if (!/^\d{4}$/.test(current)) return Alert.alert(t('wrongPin'));
      const ok = await verifyPin(current);
      if (!ok) return Alert.alert(t('wrongPin'));
    }
    setSaving(true);
    try { await clearPin(); } catch { setSaving(false); return Alert.alert(t('opFailed')); }
    setSaving(false);
    Alert.alert(t('pinRemoved'));
    onDone();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <Text style={st.title}>{has ? t('changePin') : t('setPin')}</Text>

      {has ? (
        <>
          <Text style={st.label}>{t('enterPin')}</Text>
          <TextInput style={st.input} value={current} onChangeText={setCurrent} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" placeholderTextColor={c.sub} />
        </>
      ) : null}

      <Text style={st.label}>{t('setPin')}</Text>
      <TextInput style={st.input} value={next} onChangeText={setNext} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" placeholderTextColor={c.sub} />

      <Text style={st.label}>{t('setPin')}</Text>
      <TextInput style={st.input} value={confirm} onChangeText={setConfirm} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" placeholderTextColor={c.sub} />

      <Pressable style={[st.button, saving ? st.buttonDisabled : null]} onPress={save} disabled={saving} accessibilityRole="button">
        <Text style={st.buttonText}>{saving ? t('savingOp') : t('save')}</Text>
      </Pressable>

      {has ? (
        <Pressable style={st.removeBtn} onPress={remove} disabled={saving} accessibilityRole="button">
          <Ionicons name="trash-outline" size={16} color={c.danger} />
          <Text style={st.removeText}>{t('removePin')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
    title: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4, marginBottom: 14 },
    label: { color: c.sub, fontSize: 11, fontFamily: font.bold, marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, fontSize: 20, fontFamily: font.regular, letterSpacing: 8, textAlign: 'center' },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 18 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
    removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, padding: 12 },
    removeText: { color: c.danger, fontSize: 12, fontFamily: font.bold },
  });
}
