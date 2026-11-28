import { Ionicons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CustomerLike,
  addMoney,
  customerStatus,
  dayPart,
  displayMoney,
  longDate,
  monthSalesTotal,
  splitRoute,
  todayISO,
} from '../core/fieldDay';
import { topCustomersByBalance } from '../core/fieldDay';
import { getMonthlyTarget } from '../core/target';
import { DaySummary, summarizeDay } from '../core/receipts';
import { Customer, RepProfile, VisitToday, local, receiptsAll, receiptsForDate, store } from '../db/database';
import { getLang, pick, t } from '../i18n';
import { useTheme } from './theme';

interface Props {
  version: number;
  onNewSale: (customerId?: string) => void;
  onCollection: () => void;
  onReturn: () => void;
  onCustomer: (customerId: string) => void;
  onVisit: (customerId?: string) => void;
  onExpense: () => void;
  onNewCustomer: () => void;
  onSetTarget: () => void;
  onCustomers: () => void;
  onSync: () => void;
}

const money = (v: string | null | undefined) => displayMoney(v);

export function TodayScreen({ version, onNewSale, onCollection, onReturn, onCustomer, onVisit, onExpense, onNewCustomer, onSetTarget, onCustomers, onSync }: Props) {
  const { c, font } = useTheme();
  const net = useNetInfo();
  const st = useMemo(() => makeStyles(c, font), [c, font]);
  const [rep, setRep] = useState<RepProfile | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<VisitToday[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [outbox, setOutbox] = useState<Awaited<ReturnType<typeof store.loadOutbox>>>([]);
  const [pending, setPending] = useState(0);
  const [target, setTarget] = useState<string | null>(null);
  const [monthSales, setMonthSales] = useState('0.00');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const date = todayISO();
    const [r, cs, vs, receipts, ob, tg, allR] = await Promise.all([
      local.rep(),
      local.customers(),
      local.visitsToday(),
      receiptsForDate(date),
      store.loadOutbox(),
      getMonthlyTarget(todayISO().slice(0, 7)),
      receiptsAll(),
    ]);
    setRep(r);
    setCustomers(cs);
    const pendingVisits = ob
      .filter((o) => o.type === 'VISIT' && o.status === 'PENDING')
      .map((o) => ({ customerId: String((o.payload as { customerId?: unknown }).customerId ?? ''), outcome: 'PENDING' }));
    setVisits([...vs, ...pendingVisits]);
    setSummary(summarizeDay(receipts, date));
    setPending(ob.filter((o) => o.status === 'PENDING').length);
    setOutbox(ob);
    setTarget(tg);
    setMonthSales(monthSalesTotal(allR, todayISO().slice(0, 7)));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const now = useMemo(() => new Date(), [version]);
  const route = useMemo(() => splitRoute(customers as CustomerLike[], visits), [customers, visits]);
  const upcoming = route.pending.slice(0, 4);
  const topCustomers = useMemo(() => topCustomersByBalance(customers as CustomerLike[], 3), [customers]);
  const salesToday = summary ? addMoney(summary.cashSales, summary.creditSales) : '0.00';
  const returnsToday = summary ? addMoney(summary.returnsGood, summary.returnsDamaged) : '0.00';
  const greeting = t(dayPart(now.getHours()) === 'morning' ? 'greetingMorning' : dayPart(now.getHours()) === 'afternoon' ? 'greetingAfternoon' : 'greetingEvening');
  const offline = net.isConnected === false;
  const syncLabel = offline ? t('offline') : pending > 0 ? `${pending} ${t('pending')}` : t('allSynced');
  const syncTone = offline ? st.syncOff : pending > 0 ? st.syncWait : st.syncOk;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.date}>{longDate(now, getLang())}</Text>
          <Text style={st.hello} numberOfLines={1}>
            {greeting}{rep ? `، ${pick(rep.nameAr, rep.nameEn)}` : ''}
          </Text>
        </View>
        <Pressable style={syncTone} onPress={onSync} accessibilityRole="button" accessibilityLabel={t('sync')}>
          <View style={st.dot} />
          <Text style={st.syncText} numberOfLines={1}>{syncLabel}</Text>
        </Pressable>
      </View>

      <View style={st.hero}>
        <View style={st.heroBlob} />
        <Text style={st.heroLabel}>{t('salesToday')}</Text>
        <Text style={st.heroValue}>
          {money(salesToday)} <Text style={st.heroUnit}>{t('currency')}</Text>
        </Text>
        <View style={st.stats}>
          <View style={st.stat}>
            <Text style={st.statValue} numberOfLines={1}>{money(summary?.collections)}</Text>
            <Text style={st.statLabel}>{t('collectedToday')}</Text>
          </View>
          <View style={st.stat}>
            <Text style={st.statValue}>{route.visitedCount} / {route.total}</Text>
            <Text style={st.statLabel}>{t('visitsLabel')}</Text>
          </View>
          <View style={st.stat}>
            <Text style={st.statValue} numberOfLines={1}>{money(returnsToday)}</Text>
            <Text style={st.statLabel}>{t('returnsToday')}</Text>
          </View>
        </View>
      </View>

      <Pressable style={st.cta} onPress={() => onNewSale()} accessibilityRole="button">
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={st.ctaText}>{t('newSale')}</Text>
      </Pressable>

      <View style={st.quick}>
        <QuickAction icon="cash-outline" label={t('collection')} onPress={onCollection} st={st} color={c.primary} />
        <QuickAction icon="return-down-back-outline" label={t('returns')} onPress={onReturn} st={st} color={c.primary} />
      </View>
      <View style={st.quick}>
        <QuickAction icon="receipt-outline" label={t('expense')} onPress={onExpense} st={st} color={c.primary} />
        <QuickAction icon="person-add-outline" label={t('newCustomer')} onPress={onNewCustomer} st={st} color={c.primary} />
      </View>

      <View style={st.sectionHead}>
        <Text style={st.sectionTitle}>{t('upcomingVisits')}</Text>
        <Pressable onPress={onCustomers} accessibilityRole="button">
          <Text style={st.sectionLink}>{t('viewAll')}</Text>
        </Pressable>
      </View>

      {!loaded ? null : upcoming.length === 0 ? (
        <View style={st.card}>
          <Text style={st.cardTitle}>{route.total === 0 ? t('noRoute') : t('routeDone')}</Text>
          <Text style={st.cardSub}>{route.total === 0 ? t('noData') : `${route.visitedCount} / ${route.total}`}</Text>
        </View>
      ) : (
        upcoming.map((customer) => (
          <VisitRow key={customer.id} customer={customer} st={st} c={c} onPress={() => onCustomer(customer.id)} />
        ))
      )}

      {route.total > 0 ? (
        <View style={st.progressCard}>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>{t('routeProgress')}</Text>
              <Text style={st.cardSub}>{route.visitedCount} / {route.total}</Text>
            </View>
            <View style={st.percentChip}><Text style={st.percentText}>{route.percent}%</Text></View>
          </View>
          <View style={st.track}>
            <View style={[st.fill, { width: `${route.percent}%` }]} />
          </View>
        </View>
      ) : null}

      {target ? (
        <View style={st.progressCard}>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>{t('monthlyTarget')}</Text>
              <Text style={st.cardSub}>{displayMoney(monthSales)} / {displayMoney(target)}</Text>
            </View>
            <Pressable onPress={onSetTarget} hitSlop={8}>
              <Text style={st.sectionLink}>{t('change')}</Text>
            </Pressable>
          </View>
          <View style={st.track}>
            <View style={[st.fill, { width: `${Math.min(100, target !== '0.00' ? Math.round((Number(monthSales) / Number(target)) * 100) : 0)}%` }]} />
          </View>
        </View>
      ) : (
        <Pressable style={st.progressCard} onPress={onSetTarget} accessibilityRole="button">
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>{t('monthlyTarget')}</Text>
              <Text style={st.cardSub}>{t('noTarget')}</Text>
            </View>
            <Text style={st.sectionLink}>{t('setTarget')}</Text>
          </View>
        </Pressable>
      )}
      {topCustomers.length > 0 ? (
        <View style={st.card}>
          <View style={st.sectionHead}>
            <Text style={st.cardTitle}>{t('topCustomers')}</Text>
          </View>
          {topCustomers.map((cu) => (
            <Pressable key={cu.id} style={st.visit} onPress={() => onNewSale(cu.id)} accessibilityRole="button">
              <View style={st.avatar}><Text style={st.avatarText}>{(cu.nameAr || cu.code).trim().charAt(0)}</Text></View>
              <View style={st.visitMain}>
                <Text style={st.visitName} numberOfLines={1}>{pick(cu.nameAr, cu.nameEn)}</Text>
                <Text style={st.visitMeta} numberOfLines={1}>{cu.code}</Text>
              </View>
              <View style={st.chipDue}><Text style={[st.chipText, { color: c.danger }]} numberOfLines={1}>{displayMoney(cu.balance)}</Text></View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {rep ? (
        <View style={st.custodyCard}>
          <View style={st.custodyIcon}><Ionicons name="wallet-outline" size={18} color={c.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.cardSub}>{t('custody')}</Text>
            <Text style={st.custodyValue}>{money(rep.custodyBalance)} {t('currency')}</Text>
          </View>
          <Text style={st.repChip}>{t('repRole')}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function QuickAction({
  icon, label, onPress, st, color, disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  st: ReturnType<typeof makeStyles>;
  color: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [st.quickItem, pressed && !disabled ? st.quickPressed : null, disabled ? st.quickDisabled : null]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={st.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function VisitRow({
  customer, st, c, onPress,
}: {
  customer: CustomerLike;
  st: ReturnType<typeof makeStyles>;
  c: ReturnType<typeof useTheme>['c'];
  onPress: () => void;
}) {
  const status = customerStatus(customer);
  const chip = status === 'PAID' ? st.chipPaid : status === 'OVER_LIMIT' ? st.chipOver : st.chipDue;
  const chipText = status === 'PAID' ? t('paid') : status === 'OVER_LIMIT' ? t('overLimit') : `${t('due')} ${money(customer.balance)}`;
  const initial = (customer.nameAr || customer.code || '?').trim().charAt(0);
  return (
    <Pressable style={({ pressed }) => [st.visit, pressed ? st.visitPressed : null]} onPress={onPress} accessibilityRole="button">
      <View style={st.avatar}><Text style={st.avatarText}>{initial}</Text></View>
      <View style={st.visitMain}>
        <Text style={st.visitName} numberOfLines={1}>{pick(customer.nameAr, customer.nameEn)}</Text>
        <Text style={st.visitMeta} numberOfLines={1}>
          {customer.address ?? customer.code}{customer.routeSequence != null ? ` · ${customer.routeSequence}` : ''}
        </Text>
      </View>
      <View style={chip}><Text style={[st.chipText, { color: status === 'PAID' ? c.primary : c.danger }]} numberOfLines={1}>{chipText}</Text></View>
      {customer.phone ? (
        <Pressable
          style={st.iconBtn}
          onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
          accessibilityRole="button"
          accessibilityLabel={t('phone')}
          hitSlop={8}
        >
          <Ionicons name="call-outline" size={16} color={c.primary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
    date: { color: c.sub, fontSize: 12, fontFamily: font.regular, marginBottom: 2 },
    hello: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4 },
    syncOk: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 150 },
    syncWait: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.amberSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 150 },
    syncOff: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.dangerSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 150 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary },
    syncText: { fontSize: 10, fontFamily: font.bold, color: c.primary, flexShrink: 1 },
    hero: { backgroundColor: c.primary, borderRadius: 26, padding: 20, overflow: 'hidden', shadowColor: c.shadow, shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    heroBlob: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.08)', top: -80, left: -50 },
    heroLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontFamily: font.medium },
    heroValue: { color: '#fff', fontSize: 34, fontFamily: font.extra, letterSpacing: -1, marginTop: 2 },
    heroUnit: { fontSize: 14, fontFamily: font.semibold },
    stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
    stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
    statValue: { color: '#fff', fontSize: 15, fontFamily: font.extra },
    statLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontFamily: font.regular, marginTop: 2 },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10231d', borderRadius: 18, paddingVertical: 16, marginTop: 14, marginBottom: 10 },
    ctaText: { color: '#fff', fontSize: 16, fontFamily: font.extra },
    quick: { flexDirection: 'row', gap: 8 },
    quickItem: { flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 6 },
    quickPressed: { backgroundColor: c.cream },
    quickDisabled: { opacity: 0.55 },
    quickLabel: { color: c.text, fontSize: 11, fontFamily: font.bold },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10, paddingHorizontal: 2 },
    sectionTitle: { color: c.text, fontSize: 15, fontFamily: font.extra },
    sectionLink: { color: c.primary, fontSize: 11, fontFamily: font.bold },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, marginBottom: 8 },
    cardTitle: { color: c.text, fontSize: 13, fontFamily: font.extra },
    cardSub: { color: c.sub, fontSize: 11, fontFamily: font.regular, marginTop: 3 },
    visit: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 12, marginBottom: 8 },
    visitPressed: { backgroundColor: c.cream },
    avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: c.primary, fontSize: 16, fontFamily: font.extra },
    visitMain: { flex: 1, minWidth: 0 },
    visitName: { color: c.text, fontSize: 13, fontFamily: font.extra },
    visitMeta: { color: c.sub, fontSize: 10, fontFamily: font.regular, marginTop: 3 },
    chipDue: { backgroundColor: c.dangerSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 96 },
    chipPaid: { backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 96 },
    chipOver: { backgroundColor: c.dangerSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 96 },
    chipText: { fontSize: 9, fontFamily: font.bold, color: c.text },
    iconBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    progressCard: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, marginTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    percentChip: { backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    percentText: { color: c.primary, fontSize: 10, fontFamily: font.extra },
    track: { height: 6, backgroundColor: c.cream, borderRadius: 999, overflow: 'hidden', marginTop: 10 },
    fill: { height: '100%', backgroundColor: c.primary, borderRadius: 999 },
    custodyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, marginTop: 8 },
    custodyIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
    custodyValue: { color: c.text, fontSize: 15, fontFamily: font.extra, marginTop: 2 },
    repChip: { color: c.primary, fontSize: 9, fontFamily: font.bold, backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  });
}
