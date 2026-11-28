import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CustomerLike, customerStatus, displayMoney } from '../core/fieldDay';
import { pendingNewCustomers, visitedTodayIds } from '../core/fieldOps';
import { Customer, RepProfile, VisitToday, local, store } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

type Filter = 'all' | 'due' | 'pending' | 'visited';

const FILTERS: { key: Filter; label: () => string }[] = [
  { key: 'all', label: () => t('allCustomers') },
  { key: 'due', label: () => t('dueOnly') },
  { key: 'pending', label: () => t('notVisited') },
  { key: 'visited', label: () => t('visitedFilter') },
];

export function CustomersScreen({
  onSell, onOpen, version,
}: {
  onSell: (customerId: string) => void;
  onOpen: (customerId: string) => void;
  version: number;
}) {
  const { c, font } = useTheme();
  const st = useMemo(() => makeStyles(c, font), [c, font]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<VisitToday[]>([]);
  const [outbox, setOutbox] = useState<Awaited<ReturnType<typeof store.loadOutbox>>>([]);
  const [rep, setRep] = useState<RepProfile | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([local.customers(), local.visitsToday(), local.rep(), store.loadOutbox()]).then(([cs, vs, r, ob]) => {
      const pending = pendingNewCustomers(ob).map((p) => ({
        id: p.opId,
        code: p.code,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        phone: p.phone,
        address: p.address,
        creditLimit: '0.00',
        balance: '0.00',
        routeSequence: null,
      }));
      setCustomers([...cs, ...pending]);
      setVisits(vs);
      setOutbox(ob);
      setRep(r);
      setLoaded(true);
    });
  }, [version]);

  const visited = useMemo(() => visitedTodayIds(visits, outbox), [visits, outbox]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.filter((x) => {
      const status = customerStatus(x as CustomerLike);
      const isVisited = visited.has(x.id);
      if (filter === 'due' && status === 'PAID') return false;
      if (filter === 'pending' && isVisited) return false;
      if (filter === 'visited' && !isVisited) return false;
      if (!needle) return true;
      return `${x.code} ${x.nameAr} ${x.nameEn ?? ''} ${x.phone ?? ''}`.toLowerCase().includes(needle);
    });
  }, [customers, q, filter, visited]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.date}>{t('routeToday')}</Text>
          <Text style={st.title}>{t('customers')}</Text>
        </View>
        <View style={st.countChip}>
          <Text style={st.countText}>{shown.length} / {customers.length}</Text>
        </View>
      </View>

      <View style={st.search}>
        <Ionicons name="search-outline" size={18} color={c.sub} />
        <TextInput
          style={st.searchInput}
          placeholder={t('searchCustomers')}
          placeholderTextColor={c.sub}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          returnKeyType="search"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('cancel')}>
            <Ionicons name="close-circle" size={18} color={c.sub} />
          </Pressable>
        ) : null}
      </View>

      <View style={st.filters}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <Pressable
              key={f.key}
              style={[st.filter, on ? st.filterOn : null]}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[st.filterText, on ? st.filterTextOn : null]}>{f.label()}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name={loaded ? 'people-outline' : 'cloud-download-outline'} size={30} color={c.sub} />
            <Text style={st.emptyText}>{loaded ? (customers.length ? t('noResults') : t('noData')) : t('noData')}</Text>
            {rep ? <Text style={st.emptySub}>{t('custody')}: {displayMoney(rep.custodyBalance)} {t('currency')}</Text> : null}
          </View>
        }
        renderItem={({ item }) => {
          const status = customerStatus(item as CustomerLike);
          const isVisited = visited.has(item.id);
          const chipStyle = isVisited ? st.chipVisited : status === 'PAID' ? st.chipPaid : st.chipDue;
          const chipText = isVisited ? t('visited') : status === 'PAID' ? t('paid') : status === 'OVER_LIMIT' ? t('overLimit') : t('due');
          const chipColor = isVisited ? c.sub : status === 'PAID' ? c.primary : c.danger;
          const initial = (item.nameAr || item.code || '?').trim().charAt(0);
          return (
            <Pressable
              style={({ pressed }) => [st.card, pressed ? st.cardPressed : null]}
              onPress={() => onOpen(item.id)}
              accessibilityRole="button"
              accessibilityLabel={pick(item.nameAr, item.nameEn)}
            >
              <View style={st.avatar}><Text style={st.avatarText}>{initial}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={st.nameRow}>
                  <Text style={st.name} numberOfLines={1}>{pick(item.nameAr, item.nameEn)}</Text>
                  <View style={chipStyle}><Text style={[st.chipText, { color: chipColor }]} numberOfLines={1}>{chipText}</Text></View>
                </View>
                <Text style={st.meta} numberOfLines={1}>
                  {item.code}{item.address ? ` · ${item.address}` : ''}{item.phone ? ` · ${item.phone}` : ''}
                </Text>
                <View style={st.moneyRow}>
                  <Text style={st.money}>{t('balance')} <Text style={st.moneyValue}>{displayMoney(item.balance)}</Text></Text>
                  <Text style={st.money}>{t('creditLimit')} <Text style={st.moneyValue}>{displayMoney(item.creditLimit)}</Text></Text>
                </View>
              </View>
              <View style={st.actions}>
                <Pressable
                  style={st.actionBtn}
                  onPress={() => onSell(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('newSale')}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={18} color={c.primary} />
                </Pressable>
                {item.phone ? (
                  <Pressable
                    style={st.actionBtn}
                    onPress={() => void Linking.openURL(`tel:${item.phone}`)}
                    accessibilityRole="button"
                    accessibilityLabel={t('phone')}
                    hitSlop={6}
                  >
                    <Ionicons name="call-outline" size={16} color={c.primary} />
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, gap: 10 },
    date: { color: c.sub, fontSize: 12, fontFamily: font.regular, marginBottom: 2 },
    title: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4 },
    countChip: { backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    countText: { color: c.primary, fontSize: 10, fontFamily: font.bold },
    search: {
      flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderWidth: 1,
      borderColor: c.border, borderRadius: 16, paddingHorizontal: 14, height: 48, marginHorizontal: 16,
    },
    searchInput: { flex: 1, color: c.text, fontSize: 13, fontFamily: font.regular, paddingVertical: 0 },
    filters: { flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
    filter: { borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    filterOn: { backgroundColor: c.primary, borderColor: c.primary },
    filterText: { color: c.sub, fontSize: 10, fontFamily: font.bold },
    filterTextOn: { color: '#fff' },
    card: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 11, backgroundColor: c.card, borderWidth: 1,
      borderColor: c.border, borderRadius: 18, padding: 13, marginBottom: 8,
    },
    cardPressed: { backgroundColor: c.cream },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: c.primary, fontSize: 16, fontFamily: font.extra },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { color: c.text, fontSize: 13, fontFamily: font.extra, flexShrink: 1 },
    meta: { color: c.sub, fontSize: 10, fontFamily: font.regular, marginTop: 3 },
    moneyRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
    money: { color: c.sub, fontSize: 10, fontFamily: font.regular },
    moneyValue: { color: c.text, fontSize: 11, fontFamily: font.bold },
    chipDue: { backgroundColor: c.dangerSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    chipPaid: { backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    chipVisited: { backgroundColor: c.cream, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    chipText: { fontSize: 9, fontFamily: font.bold },
    actions: { gap: 6 },
    actionBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', gap: 8, paddingTop: 60 },
    emptyText: { color: c.sub, fontSize: 13, fontFamily: font.regular, textAlign: 'center' },
    emptySub: { color: c.sub, fontSize: 11, fontFamily: font.regular },
  });
}
