import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { VISIT_OUTCOMES, VisitOutcome } from '../core/fieldOps';
import { Customer, local, enqueue } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

  const outcomeLabel = (o: VisitOutcome): string => ({
    SALE: t('outcomeSale'),
    COLLECTION: t('outcomeCollection'),
    NO_ORDER: t('outcomeNoOrder'),
    SHOP_CLOSED: t('outcomeShopClosed'),
    NOT_REACHED: t('outcomeNotReached'),
  }[o]);

const OUTCOME_ICON: Record<VisitOutcome, keyof typeof Ionicons.glyphMap> = {
  SALE: 'cart-outline',
  COLLECTION: 'cash-outline',
  NO_ORDER: 'close-circle-outline',
  SHOP_CLOSED: 'lock-closed-outline',
  NOT_REACHED: 'location-outline',
};

export function VisitScreen({ customerId, onSaved }: { customerId?: string | null; onSaved: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<string | null>(customerId ?? null);
  const [q, setQ] = useState('');
  const [outcome, setOutcome] = useState<VisitOutcome>('SALE');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void local.customers().then(setCustomers);
  }, []);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? customers.filter((x) => `${x.code} ${x.nameAr} ${x.nameEn ?? ''} ${x.phone ?? ''}`.toLowerCase().includes(needle))
      : customers;
    return list.slice(0, 40);
  }, [customers, q]);

  const who = customers.find((x) => x.id === customer) ?? null;

  async function save() {
    if (saving) return;
    if (!customer) return Alert.alert(t('selectCustomer'));
    if (!DAY.test(date)) return Alert.alert(t('date'));
    setSaving(true);
    try {
      await enqueue({
        opId: Crypto.randomUUID(),
        type: 'VISIT',
        clientCreatedAt: new Date().toISOString(),
        status: 'PENDING',
        error: null,
        attempts: 0,
        payload: { customerId: customer, outcome, visitDate: date, note: note.trim() || undefined },
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
      <Text style={st.title}>{t('logVisit')}</Text>

      {who ? (
        <View style={st.customerCard}>
          <View style={st.avatar}><Text style={st.avatarText}>{(who.nameAr || who.code).trim().charAt(0)}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.customerName} numberOfLines={1}>{pick(who.nameAr, who.nameEn)}</Text>
            <Text style={st.meta} numberOfLines={1}>{who.code}{who.address ? ` · ${who.address}` : ''}</Text>
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
          {matches.length === 0 ? (
            <Text style={st.meta}>{t('noResults')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 2 }}>
              {matches.map((item) => (
                <Pressable key={item.id} style={st.personChip} onPress={() => setCustomer(item.id)} accessibilityRole="button">
                  <Text style={st.personName} numberOfLines={1}>{pick(item.nameAr, item.nameEn)}</Text>
                  <Text style={st.personMeta} numberOfLines={1}>{item.code}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <Text style={st.label}>{t('visitOutcome')}</Text>
      <View style={st.outcomes}>
        {VISIT_OUTCOMES.map((o) => {
          const on = outcome === o;
          return (
            <Pressable
              key={o}
              style={[st.outcome, on ? st.outcomeOn : null]}
              onPress={() => setOutcome(o)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={OUTCOME_ICON[o]} size={18} color={on ? '#fff' : c.primary} />
              <Text style={[st.outcomeText, on ? { color: '#fff' } : null]}>{outcomeLabel(o)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={st.label}>{t('visitNote')}</Text>
      <TextInput
        style={[st.input, { height: 90, textAlignVertical: 'top' }]}
        value={note}
        onChangeText={setNote}
        placeholder={t('visitNote')}
        placeholderTextColor={c.sub}
        multiline
      />

      <Text style={st.label}>{t('date')}</Text>
      <TextInput
        style={st.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={c.sub}
        autoCapitalize="none"
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
    personChip: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 150 },
    personName: { color: c.text, fontSize: 11, fontFamily: font.bold },
    personMeta: { color: c.sub, fontSize: 9, fontFamily: font.regular, marginTop: 2 },
    label: { color: c.sub, fontSize: 11, fontFamily: font.bold, marginBottom: 6, marginTop: 10 },
    outcomes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    outcome: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
    outcomeOn: { backgroundColor: c.primary, borderColor: c.primary },
    outcomeText: { color: c.text, fontSize: 11, fontFamily: font.bold },
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, fontSize: 15, fontFamily: font.regular },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 18 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
  });
}
