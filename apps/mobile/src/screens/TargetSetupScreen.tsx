import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getMonthlyTarget, setMonthlyTarget, clearMonthlyTarget } from '../core/target';
import { t } from '../i18n';
import { useTheme } from './theme';

const MONEY = /^\d{1,14}(\.\d{1,2})?$/;

export function TargetSetupScreen({ onDone }: { onDone: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const month = new Date().toISOString().slice(0, 7);
  const [current, setCurrent] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => { void getMonthlyTarget(month).then((v) => { setCurrent(v); if (v) setAmount(v); }); }, [month]);

  async function save() {
    if (saving) return;
    if (!MONEY.test(amount)) return Alert.alert(t('targetAmount'));
    setSaving(true);
    try { await setMonthlyTarget(month, amount); } catch { setSaving(false); return Alert.alert(t('opFailed')); }
    setSaving(false);
    Alert.alert(t('opSaved'));
    onDone();
  }

  async function remove() {
    if (saving) return;
    setSaving(true);
    try { await clearMonthlyTarget(month); } catch { setSaving(false); return Alert.alert(t('opFailed')); }
    setSaving(false);
    Alert.alert(t('pinRemoved'));
    onDone();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <Text style={st.title}>{t('monthlyTarget')} · {month}</Text>
      {current ? <Text style={st.meta}>{t('monthlyTarget')}: {current}</Text> : <Text style={st.meta}>{t('noTarget')}</Text>}

      <Text style={st.label}>{t('targetAmount')}</Text>
      <TextInput style={st.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.sub} />

      <Pressable style={[st.button, saving ? st.buttonDisabled : null]} onPress={save} disabled={saving} accessibilityRole="button">
        <Text style={st.buttonText}>{saving ? t('savingOp') : t('setTarget')}</Text>
      </Pressable>

      {current ? (
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
    meta: { color: c.sub, fontSize: 11, fontFamily: font.regular, marginBottom: 8 },
    label: { color: c.sub, fontSize: 11, fontFamily: font.bold, marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, fontSize: 15, fontFamily: font.regular },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 18 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
    removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, padding: 12 },
    removeText: { color: c.danger, fontSize: 12, fontFamily: font.bold },
  });
}
