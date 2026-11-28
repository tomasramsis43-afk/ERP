import * as Crypto from 'expo-crypto';
import React, { useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import { OutboxItem } from '../core/outbox';
import { enqueue } from '../db/database';
import { t } from '../i18n';
import { Btn } from '../ui/kit';
import { useTheme } from './theme';

/** Creates a customer on the server at the next sync (assigned to this representative by the server). */
export function NewCustomerScreen({ onSaved }: { onSaved: () => void }) {
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const saving = useRef(false);
  const field = { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, minHeight: 48, paddingHorizontal: 14, color: c.text, fontSize: 16 } as const;

  async function save() {
    if (saving.current) return;
    if (!name.trim()) return Alert.alert(t('nameLabel'));
    const item: OutboxItem = {
      opId: Crypto.randomUUID(), type: 'CUSTOMER', clientCreatedAt: new Date().toISOString(), status: 'PENDING', error: null, attempts: 0,
      payload: { nameAr: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), ...(address.trim() ? { address: address.trim() } : {}) },
    };
    saving.current = true;
    try {
      await enqueue(item);
    } catch {
      saving.current = false;
      return Alert.alert(t('saveFailed'));
    }
    saving.current = false;
    Alert.alert(t('savedOffline'), t('newCustomerNote'));
    onSaved();
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <TextInput style={field} placeholder={t('nameLabel')} placeholderTextColor={c.sub} value={name} onChangeText={setName} maxLength={200} accessibilityLabel={t('nameLabel')} />
      <TextInput style={field} placeholder={t('phoneLabel')} placeholderTextColor={c.sub} keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={60} accessibilityLabel={t('phoneLabel')} />
      <TextInput style={field} placeholder={t('addressLabel')} placeholderTextColor={c.sub} value={address} onChangeText={setAddress} maxLength={300} accessibilityLabel={t('addressLabel')} />
      <Text style={{ color: c.sub, fontSize: 13 }}>{t('newCustomerNote')}</Text>
      <Btn label={t('save')} onPress={() => void save()} />
    </ScrollView>
  );
}
