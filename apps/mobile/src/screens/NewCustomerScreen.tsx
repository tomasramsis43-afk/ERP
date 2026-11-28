import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { enqueue } from '../db/database';
import { t } from '../i18n';
import { useTheme } from './theme';

export function NewCustomerScreen({ onSaved }: { onSaved: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!nameAr.trim()) return Alert.alert(t('customerNameAr'));
    setSaving(true);
    try {
      await enqueue({
        opId: Crypto.randomUUID(),
        type: 'CUSTOMER',
        clientCreatedAt: new Date().toISOString(),
        status: 'PENDING',
        error: null,
        attempts: 0,
        payload: {
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        },
      });
    } catch {
      setSaving(false);
      return Alert.alert(t('opFailed'));
    }
    setSaving(false);
    Alert.alert(t('customerCreated'));
    onSaved();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <Text style={st.title}>{t('newCustomerTitle')}</Text>

      <Text style={st.label}>{t('customerNameAr')} *</Text>
      <TextInput style={st.input} value={nameAr} onChangeText={setNameAr} placeholder={t('customerNameAr')} placeholderTextColor={c.sub} />

      <Text style={st.label}>{t('customerNameEn')}</Text>
      <TextInput style={st.input} value={nameEn} onChangeText={setNameEn} placeholder={t('customerNameEn')} placeholderTextColor={c.sub} />

      <Text style={st.label}>{t('customerPhone')}</Text>
      <TextInput style={st.input} value={phone} onChangeText={setPhone} placeholder={t('customerPhone')} placeholderTextColor={c.sub} keyboardType="phone-pad" />

      <Text style={st.label}>{t('customerAddress')}</Text>
      <TextInput style={[st.input, { height: 90, textAlignVertical: 'top' }]} value={address} onChangeText={setAddress} placeholder={t('customerAddress')} placeholderTextColor={c.sub} multiline />

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
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, fontSize: 15, fontFamily: font.regular },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 18 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
  });
}
