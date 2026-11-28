import * as Crypto from 'expo-crypto';
import React, { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { OutboxItem } from '../core/outbox';
import { Receipt } from '../core/receipts';
import { saveOperation } from '../db/database';
import { t } from '../i18n';
import { Btn } from '../ui/kit';
import { useTheme } from './theme';

const MONEY = /^\d{1,14}(\.\d{1,2})?$/;
const CATEGORIES = [
  ['FUEL', 'catFUEL'], ['MAINTENANCE', 'catMAINTENANCE'], ['LICENSE', 'catLICENSE'], ['INSURANCE', 'catINSURANCE'], ['OTHER', 'catOTHER'],
] as const;

/** A vehicle expense paid from the representative's custody. The server picks the vehicle and the custody account. */
export function ExpenseScreen({ onSaved }: { onSaved: () => void }) {
  const { c } = useTheme();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>('FUEL');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const saving = useRef(false);

  async function save() {
    if (saving.current) return;
    if (!MONEY.test(amount) || Number(amount) <= 0) return Alert.alert(t('amountInvalid'));
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const opId = Crypto.randomUUID();
    const item: OutboxItem = {
      opId, type: 'EXPENSE', clientCreatedAt: now.toISOString(), status: 'PENDING', error: null, attempts: 0,
      payload: { category, date, amount, ...(note.trim() ? { description: note.trim() } : {}) },
    };
    const receipt: Receipt = { opId, kind: 'EXPENSE', date, createdAt: now.toISOString(), customerId: null, customerName: null, lines: note.trim() ? [{ name: note.trim(), quantity: '1', amount: Number(amount).toFixed(2) }] : [], total: Number(amount).toFixed(2) };
    saving.current = true;
    try {
      await saveOperation(item, receipt);
    } catch {
      saving.current = false;
      return Alert.alert(t('saveFailed'));
    }
    saving.current = false;
    Alert.alert(t('savedOffline'));
    onSaved();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map(([code, key]) => (
          <Pressable key={code} onPress={() => setCategory(code)} accessibilityRole="button" accessibilityState={{ selected: category === code }} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: category === code ? c.primary : c.card, borderWidth: 1, borderColor: category === code ? c.primary : c.border }}>
            <Text style={{ color: category === code ? c.onPrimary : c.text, fontWeight: '600' }}>{t(key)}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, minHeight: 56, paddingHorizontal: 14, color: c.text, fontSize: 22, fontWeight: '700' }} placeholder={t('amount')} placeholderTextColor={c.sub} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} accessibilityLabel={t('amount')} />
      <TextInput style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, minHeight: 48, paddingHorizontal: 14, color: c.text, fontSize: 16 }} placeholder={t('noteLabel')} placeholderTextColor={c.sub} value={note} onChangeText={setNote} maxLength={300} />
      <Btn label={t('save')} onPress={() => void save()} />
    </ScrollView>
  );
}
