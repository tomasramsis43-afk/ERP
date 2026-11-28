import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { OutboxItem } from '../core/outbox';
import { Receipt } from '../core/receipts';
import { displayMoney } from '../core/fieldDay';
import { Customer, local, receiptsAll, saveOperation } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

const MONEY = /^\d{1,14}(\.\d{1,2})?$/;

export function CollectionScreen({ onSaved }: { onSaved: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<Receipt[]>([]);
  const saving = useRef(false);

  useEffect(() => {
    void local.customers().then(setCustomers);
    void receiptsAll().then((rs) => setRecent(rs.filter((r) => r.kind === 'COLLECTION').slice(-5).reverse()));
  }, []);

  const who = customers.find((x) => x.id === customer) ?? null;
  const matches = q.trim()
    ? customers.filter((x) => `${x.code} ${x.nameAr} ${x.nameEn ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    : customers;

  async function save() {
    if (saving.current) return;
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
    saving.current = true;
    try {
      await saveOperation(item, receipt);
    } catch {
      saving.current = false;
      return Alert.alert(t('saveFailed'));
    }
    Alert.alert(t('savedOffline'));
    setAmount('');
    setCustomer(null);
    setRecent((prev) => [receipt, ...prev].slice(0, 5));
    saving.current = false;
    onSaved();
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <Text style={st.title}>{t('collection')}</Text>

      {who ? (
        <View style={st.customerCard}>
          <View style={st.avatar}><Text style={st.avatarText}>{(who.nameAr || who.code).trim().charAt(0)}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.customerName} numberOfLines={1}>{pick(who.nameAr, who.nameEn)}</Text>
            <Text style={st.meta} numberOfLines={1}>{t('balance')}: {displayMoney(who.balance)}</Text>
          </View>
          <Pressable onPress={() => setCustomer(null)} hitSlop={8}>
            <Text style={st.change}>{t('change')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={st.card}>
          <Text style={st.cardTitle}>{t('selectCustomer')}</Text>
          <View style={st.search}>
            <Ionicons name="search-outline" size={17} color={c.sub} />
            <TextInput
              style={st.searchInput}
              placeholder={t('searchCustomers')}
              placeholderTextColor={c.sub}
              value={q}
              onChangeText={setQ}
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={matches.slice(0, 40)}
            keyExtractor={(x) => x.id}
            style={{ maxHeight: 260 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={st.personRow} onPress={() => setCustomer(item.id)} accessibilityRole="button">
                <Text style={st.personName} numberOfLines={1}>{pick(item.nameAr, item.nameEn)}</Text>
                <Text style={st.personMeta}>{displayMoney(item.balance)}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={st.meta}>{t('noResults')}</Text>}
          />
        </View>
      )}

      <View style={st.card}>
        <Text style={st.cardTitle}>{t('amount')}</Text>
        <TextInput
          style={st.amountInput}
          placeholder="0.00"
          placeholderTextColor={c.sub}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        <Pressable style={[st.button, (!customer || !amount) ? st.buttonDisabled : null]} onPress={save} disabled={!customer || !amount} accessibilityRole="button">
          <Text style={st.buttonText}>{t('collection')}</Text>
        </Pressable>
      </View>

      {recent.length > 0 ? (
        <View style={st.card}>
          <Text style={st.cardTitle}>{t('recentCollections')}</Text>
          {recent.map((r) => (
            <View key={r.opId} style={st.recentRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.meta} numberOfLines={1}>{r.customerName ?? '—'}</Text>
                <Text style={st.sub}>{r.date}</Text>
              </View>
              <Text style={st.money}>{displayMoney(r.total)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
    title: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4, marginBottom: 14 },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 13, marginBottom: 10 },
    cardTitle: { color: c.text, fontSize: 13, fontFamily: font.extra, marginBottom: 8 },
    customerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 13, marginBottom: 10 },
    avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: c.primary, fontSize: 16, fontFamily: font.extra },
    customerName: { color: c.text, fontSize: 13, fontFamily: font.extra },
    meta: { color: c.sub, fontSize: 10, fontFamily: font.regular, marginTop: 3 },
    change: { color: c.primary, fontSize: 10, fontFamily: font.bold },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, height: 42, marginBottom: 10 },
    searchInput: { flex: 1, color: c.text, fontSize: 12, fontFamily: font.regular, paddingVertical: 0 },
    personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: c.border },
    personName: { color: c.text, fontSize: 12, fontFamily: font.bold, flexShrink: 1 },
    personMeta: { color: c.sub, fontSize: 10, fontFamily: font.regular },
    amountInput: { backgroundColor: c.bg, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14, fontSize: 24, fontFamily: font.extra, textAlign: 'center', marginBottom: 10 },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center' },
    buttonDisabled: { opacity: 0.45 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
    recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderColor: c.border },
    money: { color: c.text, fontSize: 12, fontFamily: font.bold },
    sub: { color: c.sub, fontSize: 9, fontFamily: font.regular, marginTop: 2 },
  });
}
