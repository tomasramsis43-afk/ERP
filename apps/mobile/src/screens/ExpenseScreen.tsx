import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../core/fieldOps';
import { enqueue } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

const MONEY = /^(?!0+(\.0+)?$)\d{1,14}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function catMeta(cat: ExpenseCategory): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (cat) {
    case 'FUEL': return { label: t('catFuel'), icon: 'car-outline' };
    case 'MAINTENANCE': return { label: t('catMaintenance'), icon: 'construct-outline' };
    case 'LICENSE': return { label: t('catLicense'), icon: 'document-text-outline' };
    case 'INSURANCE': return { label: t('catInsurance'), icon: 'shield-checkmark-outline' };
    case 'OTHER': return { label: t('catOther'), icon: 'ellipsis-horizontal-circle-outline' };
  }
}

export function ExpenseScreen({ onSaved }: { onSaved: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [category, setCategory] = useState<ExpenseCategory>('FUEL');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!MONEY.test(amount)) return Alert.alert(t('amount'));
    if (!DAY.test(date)) return Alert.alert(t('date'));
    setSaving(true);
    try {
      await enqueue({
        opId: Crypto.randomUUID(),
        type: 'EXPENSE',
        clientCreatedAt: new Date().toISOString(),
        status: 'PENDING',
        error: null,
        attempts: 0,
        payload: { category, date, amount, description: description.trim() || undefined },
      });
    } catch {
      setSaving(false);
      return Alert.alert(t('opFailed'));
    }
    setSaving(false);
    Alert.alert(t('opSaved'));
    onSaved();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <Text style={st.title}>{t('expenseNew')}</Text>

      <Text style={st.label}>{t('expenseCategory')}</Text>
      <View style={st.grid}>
        {EXPENSE_CATEGORIES.map((cat) => {
          const on = category === cat;
          return (
            <Pressable
              key={cat}
              style={[st.cat, on ? st.catOn : null]}
              onPress={() => setCategory(cat)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              {(() => { const m = catMeta(cat); return (<><Ionicons name={m.icon} size={20} color={on ? '#fff' : c.primary} /><Text style={[st.catText, on ? { color: '#fff' } : null]}>{m.label}</Text></>); })()}
            </Pressable>
          );
        })}
      </View>

      <Text style={st.label}>{t('expenseAmount')}</Text>
      <TextInput
        style={st.input}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        placeholderTextColor={c.sub}
      />

      <Text style={st.label}>{t('expenseDate')}</Text>
      <TextInput
        style={st.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={c.sub}
        autoCapitalize="none"
      />

      <Text style={st.label}>{t('expenseDescription')}</Text>
      <TextInput
        style={[st.input, { height: 90, textAlignVertical: 'top' }]}
        value={description}
        onChangeText={setDescription}
        placeholder={t('expenseDescription')}
        placeholderTextColor={c.sub}
        multiline
      />

      <Pressable style={[st.button, saving ? st.buttonDisabled : null]} onPress={save} disabled={saving} accessibilityRole="button">
        <Text style={st.buttonText}>{saving ? t('savingOp') : t('save')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
    title: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4, marginBottom: 14 },
    label: { color: c.sub, fontSize: 11, fontFamily: font.bold, marginBottom: 6, marginTop: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cat: { width: '31%', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 6 },
    catOn: { backgroundColor: c.primary, borderColor: c.primary },
    catText: { color: c.text, fontSize: 10, fontFamily: font.bold },
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, fontSize: 15, fontFamily: font.regular },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 18 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
  });
}
