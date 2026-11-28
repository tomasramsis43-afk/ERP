import React, { useCallback, useEffect, useState } from 'react';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, FlatList, Pressable, Share, Text, View } from 'react-native';
import { SummaryLabels, daySummaryHtml, receiptHtml } from '../core/receiptHtml';
import { Receipt, ReceiptKind, ReceiptLabels, receiptText, summarizeDay } from '../core/receipts';
import { pruneOldReceipts, receiptsForDate, store } from '../db/database';
import { getLang, t } from '../i18n';
import { dir, kindKey, labels, sharePdf } from './receiptShare';
import { useTheme } from './theme';

const summaryLabels = (): SummaryLabels => ({
  title: t('daySummary'), date: t('date'), operations: t('operations'), cashSales: t('cashSales'), creditSales: t('creditSales'),
  collections: t('collections'), returnsGood: t('returnsGood'), returnsDamaged: t('returnsDamaged'), cashRefunds: t('cashRefunds'), expenses: t('expenses'),
  expectedCash: t('expectedCash'), estimate: t('estimate'),
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
      <Text style={s.sub}>{today}</Text>
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
      <Pressable style={s.ghost} onPress={() => void sharePdf(daySummaryHtml(sum, summaryLabels(), dir()))} accessibilityRole="button">
        <Text style={{ color: c.primary }}>{t('pdfSummary')}</Text>
      </Pressable>
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
            <Pressable style={{ marginStart: 12 }} onPress={() => void sharePdf(receiptHtml(item, labels(), dir()))} accessibilityRole="button">
              <Text style={{ color: c.primary }}>{t('pdf')}</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
