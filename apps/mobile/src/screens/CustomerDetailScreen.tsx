import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getCustomerPhoto } from './PhotoCaptureScreen';
import { Customer, local, store } from '../db/database';
import { get } from '../api/client';
import { pendingNewCustomers } from '../core/fieldOps';
import { pick, t } from '../i18n';
import { CustomerLike, customerStatus, displayMoney } from '../core/fieldDay';
import { useTheme } from './theme';

interface StatementRow { date: string; number: string; description: string; debit: string; credit: string; balance: string; }
interface StatementResp {
  customer: { id: string; code: string; nameAr: string; nameEn: string | null; phone: string | null; address: string | null; creditLimit: string };
  openingBalance: string;
  closingBalance: string;
  rows: StatementRow[];
  aging: { current: string; days1to30: string; days31to60: string; days61to90: string; over90: string; total: string; unappliedCredit: string };
}

export function CustomerDetailScreen({
  customerId, onSell, onVisit, onCapturePhoto, onBack,
}: {
  customerId: string;
  onSell: (id: string) => void;
  onVisit: (id: string) => void;
  onCapturePhoto: (id: string) => void;
  onBack: () => void;
}) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pending, setPending] = useState(false);
  const [statement, setStatement] = useState<StatementResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    void SecureStore.getItemAsync(`erp.note.${customerId}`).then((v) => { if (v) setNotes(v); });
    void getCustomerPhoto(customerId).then(setPhotoUri);
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cs = await local.customers();
      const found = cs.find((x) => x.id === customerId) ?? null;
      if (found) { if (!cancelled) setCustomer(found); }
      else {
        // Might be a customer created offline this session.
        const outbox = await store.loadOutbox();
        const pendingRows = pendingNewCustomers(outbox);
        const p = pendingRows.find((x) => x.opId === customerId);
        if (p) {
          if (!cancelled) {
            setPending(true);
            setCustomer({ id: p.opId, code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, phone: p.phone, address: p.address, creditLimit: '0.00', balance: '0.00', routeSequence: null });
          }
        }
      }
      try {
        const s = await get<StatementResp>(`/sync/customers/${customerId}/statement`);
        if (!cancelled) setStatement(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('onlineOnly'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const name = customer ? pick(customer.nameAr, customer.nameEn) : customerId;
  const status = customer ? customerStatus(customer as CustomerLike) : null;

  async function saveNotes() {
    if (savingNotes) return;
    setSavingNotes(true);
    try { await SecureStore.setItemAsync(`erp.note.${customerId}`, notes); } catch { setSavingNotes(false); return; }
    setSavingNotes(false);
    Alert.alert(t('notesSaved'));
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content}>
      <Pressable style={st.back} onPress={onBack} accessibilityRole="button">
        <Ionicons name="chevron-forward" size={18} color={c.primary} />
        <Text style={st.backText}>{t('customers')}</Text>
      </Pressable>

      <View style={st.header}>
        <View style={st.avatar}><Text style={st.avatarText}>{(name || '?').trim().charAt(0)}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{name}</Text>
          <Text style={st.meta} numberOfLines={1}>{customer?.code ?? ''}{customer?.address ? ` · ${customer.address}` : ''}</Text>
          {pending ? <Text style={st.pendingTag}>{t('pendingCustomer')}</Text> : null}
        </View>
        {status ? (
          <View style={[st.chip, { backgroundColor: status === 'PAID' ? c.soft : c.dangerSoft }]}>
            <Text style={[st.chipText, { color: status === 'PAID' ? c.primary : c.danger }]}>
              {status === 'PAID' ? t('paid') : status === 'OVER_LIMIT' ? t('overLimit') : t('due')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={st.actions}>
        <Pressable style={st.action} onPress={() => onSell(customerId)} accessibilityRole="button">
          <Ionicons name="add" size={18} color={c.primary} />
          <Text style={st.actionText}>{t('newSale')}</Text>
        </Pressable>
        <Pressable style={st.action} onPress={() => onVisit(customerId)} accessibilityRole="button">
          <Ionicons name="location-outline" size={18} color={c.primary} />
          <Text style={st.actionText}>{t('visit')}</Text>
        </Pressable>
        <Pressable style={st.action} onPress={() => onCapturePhoto(customerId)} accessibilityRole="button">
          <Ionicons name="camera-outline" size={18} color={c.primary} />
          <Text style={st.actionText}>{t('scan')}</Text>
        </Pressable>
      </View>

      {photoUri ? (
        <View style={st.card}>
          <Image source={{ uri: photoUri }} style={st.photo} resizeMode="cover" />
        </View>
      ) : null}

      {loading ? (
        <View style={st.center}><ActivityIndicator color={c.primary} /></View>
      ) : error ? (
        <View style={st.card}><Text style={st.meta}>{error}</Text></View>
      ) : statement ? (
        <>
          <View style={st.card}>
            <Text style={st.cardTitle}>{t('statementTitle')}</Text>
            <View style={st.row}>
              <Text style={st.meta}>{t('openingBalance')}</Text>
              <Text style={st.money}>{displayMoney(statement.openingBalance)}</Text>
            </View>
            <View style={st.row}>
              <Text style={st.meta}>{t('closingBalance')}</Text>
              <Text style={st.money}>{displayMoney(statement.closingBalance)}</Text>
            </View>
            {statement.rows.length === 0 ? (
              <Text style={st.meta}>{t('noStatement')}</Text>
            ) : (
              statement.rows.slice(-12).map((r, i) => (
                <View key={i} style={st.statementRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.statementDate} numberOfLines={1}>{r.date} · {r.number}</Text>
                    <Text style={st.meta} numberOfLines={1}>{r.description}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={st.money}>{displayMoney(r.debit)} / {displayMoney(r.credit)}</Text>
                    <Text style={st.meta}>{displayMoney(r.balance)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={st.card}>
            <Text style={st.cardTitle}>{t('agingTitle')}</Text>
            {[
              [t('agingCurrent'), statement.aging.current],
              [t('aging1to30'), statement.aging.days1to30],
              [t('aging31to60'), statement.aging.days31to60],
              [t('aging61to90'), statement.aging.days61to90],
              [t('agingOver90'), statement.aging.over90],
            ].map(([label, val]) => (
              <View key={label} style={st.row}>
                <Text style={st.meta}>{label}</Text>
                <Text style={st.money}>{displayMoney(val as string)}</Text>
              </View>
            ))}
            <View style={st.divider} />
            <View style={st.row}>
              <Text style={st.meta}>{t('total')}</Text>
              <Text style={st.money}>{displayMoney(statement.aging.total)}</Text>
            </View>
            {Number(statement.aging.unappliedCredit) > 0 ? (
              <View style={st.row}>
                <Text style={st.meta}>{t('unappliedCredit')}</Text>
                <Text style={st.money}>{displayMoney(statement.aging.unappliedCredit)}</Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      <View style={st.card}>
        <Text style={st.cardTitle}>{t('customerNotes')}</Text>
        <TextInput
          style={[st.input, { height: 90, textAlignVertical: 'top' }]}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('customerNotes')}
          placeholderTextColor={c.sub}
          multiline
        />
        <Pressable style={[st.button, savingNotes ? st.buttonDisabled : null]} onPress={saveNotes} disabled={savingNotes} accessibilityRole="button">
          <Text style={st.buttonText}>{savingNotes ? t('savingOp') : t('saveNotes')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
    backText: { color: c.primary, fontSize: 12, fontFamily: font.bold },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 14, marginBottom: 10 },
    avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: c.primary, fontSize: 16, fontFamily: font.extra },
    name: { color: c.text, fontSize: 16, fontFamily: font.extra },
    meta: { color: c.sub, fontSize: 10, fontFamily: font.regular, marginTop: 3 },
    pendingTag: { color: c.amber, fontSize: 9, fontFamily: font.bold, marginTop: 4 },
    chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
    chipText: { fontSize: 9, fontFamily: font.bold },
    actions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 16, paddingVertical: 12 },
    actionText: { color: c.text, fontSize: 11, fontFamily: font.bold },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, marginBottom: 10 },
    cardTitle: { color: c.text, fontSize: 13, fontFamily: font.extra, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    money: { color: c.text, fontSize: 12, fontFamily: font.bold },
    statementRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderColor: c.border },
    statementDate: { color: c.text, fontSize: 10, fontFamily: font.bold },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 8 },
    center: { paddingVertical: 40, alignItems: 'center' },
    photo: { width: '100%', height: 180, borderRadius: 14 },
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, fontSize: 14, fontFamily: font.regular },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 14 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
  });
}
