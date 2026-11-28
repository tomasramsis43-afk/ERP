import * as Crypto from 'expo-crypto';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { get } from '../api/client';
import { customerStatus } from '../core/dashboard';
import { whatsappNumber } from '../core/phone';
import { OutboxItem } from '../core/outbox';
import { Receipt } from '../core/receipts';
import { Customer, local, receiptsSince, saveVisit } from '../db/database';
import { pick, t } from '../i18n';
import { Btn, Empty, Pill, Skeleton } from '../ui/kit';
import { kindKey } from './receiptShare';
import { Nav } from './nav';
import { useTheme } from './theme';

interface Statement {
  closingBalance: string;
  rows: { date: string; number: string | number; description: string | null; debit: string; credit: string; balance: string }[];
}

const OUTCOMES = [
  ['NO_ORDER', 'outNoOrder'], ['SHOP_CLOSED', 'outClosed'], ['NOT_REACHED', 'outNotReached'],
] as const;

export function CustomerScreen({ id, nav, onChanged }: { id: string; nav: Nav; onChanged: () => void }) {
  const { c } = useTheme();
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [recent, setRecent] = useState<Receipt[]>([]);
  const [visitOpen, setVisitOpen] = useState(false);
  const [note, setNote] = useState('');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  useEffect(() => {
    void local.customers().then((all) => setCustomer(all.find((x) => x.id === id) ?? null));
    void receiptsSince(since).then((all) => setRecent(all.filter((r) => r.customerId === id).slice(0, 8)));
  }, [id, since]);

  if (customer === undefined) return <View style={{ padding: 16 }}><Skeleton rows={3} height={110} /></View>;
  if (customer === null) return <Empty icon="people" text={t('noData')} />;

  const st = customerStatus(customer);
  const limit = Number(customer.creditLimit);
  const used = limit > 0 ? Math.min(1, Math.max(0, Number(customer.balance) / limit)) : 0;

  async function logVisit(outcome: (typeof OUTCOMES)[number][0]) {
    const now = new Date();
    const item: OutboxItem = {
      opId: Crypto.randomUUID(), type: 'VISIT', clientCreatedAt: now.toISOString(), status: 'PENDING', error: null, attempts: 0,
      payload: { customerId: id, outcome, visitDate: now.toISOString().slice(0, 10), ...(note.trim() ? { note: note.trim() } : {}) },
    };
    try {
      await saveVisit(item, now.toISOString().slice(0, 10), id);
    } catch {
      return Alert.alert(t('saveFailed'));
    }
    setVisitOpen(false);
    setNote('');
    onChanged();
    Alert.alert(t('visitSaved'));
  }

  async function loadStatement() {
    setLoadingStatement(true);
    try {
      setStatement(await get<Statement>(`/sync/customers/${id}/statement`));
    } catch {
      Alert.alert(t('needOnlineStatement'));
    } finally {
      setLoadingStatement(false);
    }
  }

  const call = () => (customer.phone ? void Linking.openURL(`tel:${customer.phone}`) : Alert.alert(t('noPhone')));
  const chat = () => (customer.phone ? void Linking.openURL(`https://wa.me/${whatsappNumber(customer.phone)}`) : Alert.alert(t('noPhone')));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{pick(customer.nameAr, customer.nameEn)}</Text>
      <Text style={{ color: c.sub, marginTop: 2 }}>{customer.code}{customer.address ? ` · ${customer.address}` : ''}</Text>

      <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 16, marginTop: 14, borderWidth: 1, borderColor: c.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: c.sub }}>{t('balance')}</Text>
          <Pill tone={st === 'OVER_LIMIT' ? 'danger' : st === 'DUE' ? 'warn' : 'ok'} label={st === 'OVER_LIMIT' ? t('statusOver') : st === 'DUE' ? t('statusDue') : t('statusClear')} />
        </View>
        <Text style={{ color: c.text, fontSize: 30, fontWeight: '700' }}>{customer.balance}</Text>
        {limit > 0 ? (
          <View style={{ marginTop: 10 }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(used * 100)}%`, height: 8, backgroundColor: st === 'OVER_LIMIT' ? c.danger : used > 0.9 ? c.warn : c.primary }} />
            </View>
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 4 }}>{t('limitUsed')}: {Math.round(used * 100)}% · {t('creditLimit')} {customer.creditLimit}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Btn flex={1} kind="ink" label={t('newSale')} icon="plus" onPress={() => nav.open({ name: 'sale', customerId: id })} />
        <Btn flex={1} kind="outline" label={t('collection')} icon="cash" onPress={() => nav.open({ name: 'collection', customerId: id })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Btn flex={1} kind="outline" label={t('call')} icon="phone" onPress={call} />
        <Btn flex={1} kind="outline" label={t('whatsapp')} icon="chat" onPress={chat} />
        <Btn flex={1} kind="outline" label={t('logVisit')} icon="flag" onPress={() => setVisitOpen(true)} />
      </View>
      <View style={{ marginTop: 10 }}>
        <Btn kind="outline" label={t('returns')} icon="undo" onPress={() => nav.open({ name: 'return', customerId: id })} />
      </View>

      <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', marginTop: 22, marginBottom: 10 }}>{t('recentActivity')}</Text>
      {recent.length === 0 ? <Text style={{ color: c.sub }}>{t('noOps')}</Text> : recent.map((r) => (
        <View key={r.opId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: c.border }}>
          <View>
            <Text style={{ color: c.text, fontWeight: '600' }}>{t(kindKey[r.kind])}</Text>
            <Text style={{ color: c.sub, fontSize: 12 }}>{r.date}</Text>
          </View>
          <Text style={{ color: c.text, fontWeight: '700' }}>{r.total}</Text>
        </View>
      ))}

      <View style={{ marginTop: 18 }}>
        <Btn kind="outline" label={t('statement')} icon="receipt" onPress={loadStatement} disabled={loadingStatement} />
      </View>
      {statement ? (
        <View style={{ marginTop: 10 }}>
          {statement.rows.slice(-15).reverse().map((r, i) => (
            <View key={`${r.number}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: c.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 14 }} numberOfLines={1}>{r.description ?? r.number}</Text>
                <Text style={{ color: c.sub, fontSize: 12 }}>{r.date}</Text>
              </View>
              <Text style={{ color: c.text, fontWeight: '600' }}>{r.balance}</Text>
            </View>
          ))}
          <Text style={{ color: c.text, fontWeight: '700', marginTop: 8 }}>{t('balance')}: {statement.closingBalance}</Text>
        </View>
      ) : null}

      <Modal visible={visitOpen} transparent animationType="slide" onRequestClose={() => setVisitOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10 }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>{t('visitOutcome')}</Text>
            <TextInput style={{ borderWidth: 1, borderColor: c.border, borderRadius: 14, minHeight: 48, paddingHorizontal: 14, color: c.text, fontSize: 16 }} placeholder={t('noteLabel')} placeholderTextColor={c.sub} value={note} onChangeText={setNote} maxLength={500} />
            {OUTCOMES.map(([code, key]) => <Btn key={code} kind="outline" label={t(key)} onPress={() => void logVisit(code)} />)}
            <Pressable onPress={() => setVisitOpen(false)} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button"><Text style={{ color: c.sub }}>{t('cancel')}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
