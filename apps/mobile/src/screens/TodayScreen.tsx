import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { customerStatus, nextVisits, todayStats, visitedToday } from '../core/dashboard';
import { Receipt } from '../core/receipts';
import { Customer, RepProfile, local, receiptsForDate, store, visitsForDate } from '../db/database';
import { pick, t } from '../i18n';
import { Btn, Empty, Pill, Skeleton } from '../ui/kit';
import { Nav } from './nav';
import { useTheme } from './theme';

interface Data {
  rep: RepProfile | null;
  customers: Customer[];
  receipts: Receipt[];
  visits: string[];
  pending: number;
}

export function TodayScreen({ version, nav }: { version: number; nav: Nav }) {
  const { c } = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [rep, customers, receipts, visits, outbox] = await Promise.all([local.rep(), local.customers(), receiptsForDate(today), visitsForDate(today), store.loadOutbox()]);
      if (alive) setData({ rep, customers, receipts, visits, pending: outbox.filter((o) => o.status === 'PENDING').length });
    })();
    return () => { alive = false; };
  }, [version, today]);

  if (!data) return <View style={{ padding: 16 }}><Skeleton rows={4} height={90} /></View>;

  const stats = todayStats(data.receipts, today);
  const visited = visitedToday(data.receipts, today, data.visits);
  const next = nextVisits(data.customers, visited, 5);
  const visitedCount = data.customers.filter((x) => visited.has(x.id)).length;
  const mini = (label: string, value: string) => (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF26', borderRadius: 14, padding: 10 }}>
      <Text style={{ color: c.onPrimary, opacity: 0.85, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: c.onPrimary, fontWeight: '700', fontSize: 17 }}>{value}</Text>
    </View>
  );
  const quick = (label: string, f: Parameters<Nav['open']>[0]) => (
    <Pressable key={label} onPress={() => nav.open(f)} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
      <Text style={{ color: c.sub, fontSize: 13 }}>{today}</Text>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '700', marginBottom: 14 }}>
        {t('hello')}{data.rep ? `، ${pick(data.rep.nameAr, data.rep.nameEn)}` : ''}
      </Text>

      <View style={{ backgroundColor: c.primary, borderRadius: 24, padding: 20 }}>
        <Text style={{ color: c.onPrimary, opacity: 0.85, fontSize: 13 }}>{t('salesToday')}</Text>
        <Text style={{ color: c.onPrimary, fontSize: 34, fontWeight: '700' }}>{stats.sales}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {mini(t('collected'), stats.collections)}
          {mini(t('visitsLabel'), `${visitedCount} / ${data.customers.length}`)}
          {mini(t('returnsShort'), stats.returns)}
        </View>
      </View>

      {data.pending > 0 ? (
        <Pressable onPress={() => nav.open({ name: 'sync' })} accessibilityRole="button" style={{ marginTop: 12 }}>
          <Pill tone="warn" label={`${data.pending} ${t('waitingOps')}`} />
        </Pressable>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <Btn label={t('newSaleBtn')} kind="ink" onPress={() => nav.open({ name: 'sale' })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        {quick(t('collection'), { name: 'collection' })}
        {quick(t('returns'), { name: 'return' })}
        {quick(t('expense'), { name: 'expense' })}
      </View>

      <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', marginTop: 22, marginBottom: 10 }}>{t('nextVisits')}</Text>
      {next.length === 0 ? (
        <Empty icon="check" text={t('allVisited')} />
      ) : (
        next.map((cu) => {
          const st = customerStatus(cu);
          return (
            <Pressable key={cu.id} onPress={() => nav.open({ name: 'customer', id: cu.id })} accessibilityRole="button" style={{ backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{pick(cu.nameAr, cu.nameEn)}</Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 2 }}>{cu.address ?? cu.code} · {t('balance')} {cu.balance}</Text>
              </View>
              <Pill tone={st === 'OVER_LIMIT' ? 'danger' : st === 'DUE' ? 'warn' : 'ok'} label={st === 'OVER_LIMIT' ? t('statusOver') : st === 'DUE' ? t('statusDue') : t('statusClear')} />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
