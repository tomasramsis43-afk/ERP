import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Share, Text, View } from 'react-native';
import { Receipt, ReceiptKind, ReceiptLabels, receiptText, summarizeDay } from '../core/receipts';
import { pruneOldReceipts, receiptsForDate, store } from '../db/database';
import { t } from '../i18n';
import { useTheme } from './theme';

const kindKey: Record<ReceiptKind, 'receiptCashSale' | 'receiptCreditSale' | 'receiptReturnGood' | 'receiptReturnDamaged' | 'receiptCollection'> = {
  CASH_SALE: 'receiptCashSale',
  CREDIT_SALE: 'receiptCreditSale',
  RETURN_GOOD: 'receiptReturnGood',
  RETURN_DAMAGED: 'receiptReturnDamaged',
  COLLECTION: 'receiptCollection',
};

const labels = (): ReceiptLabels => ({
  title: Object.fromEntries((Object.keys(kindKey) as ReceiptKind[]).map((k) => [k, t(kindKey[k])])) as Record<ReceiptKind, string>,
  customer: t('customers'),
  date: t('date'),
  total: t('total'),
  estimate: t('estimate'),
  ref: t('ref'),
});

export function DaySummaryScreen({ version }: { version: number }) {
  const { s, c } = useTheme();
  const today = new Date().toISOString().slice(0, 10);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [unsent, setUnsent] = useState(0);

  const load = useCallback(async () => {
    await pruneOldReceipts(today);
    setReceipts(await receiptsForDate(today));
    setUnsent((await store.loadOutbox()).length);
  }, [today]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const sum = summarizeDay(receipts, today);
  const row = (label: string, value: string, bold = false) => (
    <View style={s.row} key={label}>
      <Text style={bold ? [s.text, { fontWeight: '700' }] : s.sub}>{label}</Text>
      <Text style={bold ? [s.text, { fontWeight: '700' }] : s.text}>{value}</Text>
    </View>
  );

  return (
    <View style={s.screen}>
      <Text style={s.title}>{t('daySummary')} · {today}</Text>
      <View style={s.card}>
        {row(t('operations'), String(sum.count))}
        {row(t('cashSales'), sum.cashSales)}
        {row(t('creditSales'), sum.creditSales)}
        {row(t('collections'), sum.collections)}
        {row(t('returnsGood'), sum.returnsGood)}
        {row(t('returnsDamaged'), sum.returnsDamaged)}
        {row(t('cashRefunds'), sum.cashRefunds)}
        {row(t('expectedCash'), sum.expectedCash, true)}
      </View>
      <Text style={unsent ? s.error : s.sub}>{unsent ? `${t('unsyncedOps')}: ${unsent}` : t('allSynced')}</Text>
      <Text style={s.sub}>{t('estimate')}</Text>
      <FlatList
        data={receipts}
        keyExtractor={(r) => r.opId}
        ListEmptyComponent={<Text style={s.sub}>{t('noOps')}</Text>}
        renderItem={({ item }) => (
          <View style={[s.card, s.row]}>
            <View style={{ flex: 1 }}>
              <Text style={s.text}>{t(kindKey[item.kind])}</Text>
              <Text style={s.sub}>{item.customerName ?? '—'} · {item.total}</Text>
            </View>
            <Pressable onPress={() => void Share.share({ message: receiptText(item, labels()) })}>
              <Text style={{ color: c.primary }}>{t('share')}</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
