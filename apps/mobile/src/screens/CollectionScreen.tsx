import * as Crypto from 'expo-crypto';
import React, { useEffect, useState, useRef } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Receipt } from '../core/receipts';
import { OutboxItem } from '../core/outbox';
import { Customer, local, saveOperation } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

const MONEY = /^\d{1,14}(\.\d{1,2})?$/;

export function CollectionScreen({ onSaved }: { onSaved: () => void }) {
  const { s, c } = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    void local.customers().then(setCustomers);
  }, []);

  // Blocks a second tap while the first save is still running, so one tap can never create two operations.
  const saving = useRef(false);
  async function save() {
    if (saving.current) return;
    saving.current = true;
    try {
      await saveOnce();
    } finally {
      saving.current = false;
    }
  }

  async function saveOnce() {
    if (!customer) return Alert.alert(t('selectCustomer'));
    if (!MONEY.test(amount) || Number(amount) <= 0) return Alert.alert(t('amount'));
    const now = new Date();
    const opId = Crypto.randomUUID();
    const item: OutboxItem = {
      opId,
      type: 'COLLECTION',
      clientCreatedAt: now.toISOString(),
      status: 'PENDING',
      error: null,
      attempts: 0,
      payload: { customerId: customer, amount, date: now.toISOString().slice(0, 10) },
    };
    const who = customers.find((x) => x.id === customer);
    const receipt: Receipt = {
      opId,
      kind: 'COLLECTION',
      date: now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
      customerId: customer,
      customerName: who ? pick(who.nameAr, who.nameEn) : null,
      lines: [],
      total: Number(amount).toFixed(2),
    };
    await saveOperation(item, receipt);
    Alert.alert(t('savedOffline'));
    setAmount('');
    setCustomer(null);
    onSaved();
  }

  return (
    <View style={s.screen}>
      <Text style={s.title}>{t('collection')}</Text>
      <FlatList
        data={customers}
        keyExtractor={(x) => x.id}
        style={{ maxHeight: 320, marginBottom: 10 }}
        renderItem={({ item }) => (
          <Pressable style={[s.card, customer === item.id ? { borderColor: c.primary } : null]} onPress={() => setCustomer(item.id)}>
            <Text style={s.text}>{pick(item.nameAr, item.nameEn)}</Text>
            <Text style={s.sub}>{t('balance')}: {item.balance}</Text>
          </Pressable>
        )}
      />
      <TextInput style={s.input} placeholder={t('amount')} placeholderTextColor={c.sub} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <Pressable style={s.button} onPress={save}>
        <Text style={s.buttonText}>{t('save')}</Text>
      </Pressable>
    </View>
  );
}
