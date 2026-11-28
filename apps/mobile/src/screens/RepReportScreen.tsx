import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { get } from '../api/client';
import { displayMoney } from '../core/fieldDay';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

interface ReportResp {
  from: string; to: string;
  sales: { count: number; total: string; cash: string; credit: string };
  returns: { count: number; total: string };
  collections: { count: number; total: string };
  expenses: { count: number; total: string };
  commission: { earnedInRange: string; unpaidTotal: string };
  visits: Record<string, number>;
}

export function RepReportScreen() {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<ReportResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<ReportResp>(`/sync/me/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('onlineOnly'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const visitEntries = report ? Object.entries(report.visits) : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content}>
      <Text style={st.title}>{t('reportTitle')}</Text>

      <View style={st.range}>
        <View style={{ flex: 1 }}>
          <Text style={st.label}>{t('reportFrom')}</Text>
          <TextInput style={st.input} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" placeholderTextColor={c.sub} autoCapitalize="none" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.label}>{t('reportTo')}</Text>
          <TextInput style={st.input} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" placeholderTextColor={c.sub} autoCapitalize="none" />
        </View>
      </View>
      <Pressable style={st.button} onPress={run} disabled={loading} accessibilityRole="button">
        <Text style={st.buttonText}>{loading ? t('savingOp') : t('reportRun')}</Text>
      </Pressable>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={c.primary} /></View>
      ) : error ? (
        <View style={st.card}><Text style={st.meta}>{error}</Text></View>
      ) : report ? (
        <>
          <View style={st.card}>
            <Text style={st.cardTitle}>{t('reportSales')}</Text>
            <StatRow label={t('reportSales')} value={report.sales.total} sub={`${report.sales.count} · ${t('cash')} ${displayMoney(report.sales.cash)} · ${t('credit')} ${displayMoney(report.sales.credit)}`} st={st} c={c} />
            <StatRow label={t('reportReturns')} value={report.returns.total} sub={`${report.returns.count}`} st={st} c={c} />
            <StatRow label={t('reportCollections')} value={report.collections.total} sub={`${report.collections.count}`} st={st} c={c} />
            <StatRow label={t('reportExpenses')} value={report.expenses.total} sub={`${report.expenses.count}`} st={st} c={c} />
          </View>
          <View style={st.card}>
            <Text style={st.cardTitle}>{t('reportCommission')}</Text>
            <StatRow label={t('reportEarned')} value={report.commission.earnedInRange} st={st} c={c} />
            <StatRow label={t('reportUnpaid')} value={report.commission.unpaidTotal} st={st} c={c} />
          </View>
          <View style={st.card}>
            <Text style={st.cardTitle}>{t('reportVisits')}</Text>
            {visitEntries.length === 0 ? (
              <Text style={st.meta}>{t('reportNoData')}</Text>
            ) : (
              visitEntries.map(([k, v]) => (
                <View key={k} style={st.row}>
                  <Text style={st.meta}>{k}</Text>
                  <Text style={st.money}>{v}</Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : (
        <View style={st.card}><Text style={st.meta}>{t('reportNoData')}</Text></View>
      )}
    </ScrollView>
  );
}

function StatRow({ label, value, sub, st, c }: { label: string; value: string; sub?: string; st: ReturnType<typeof makeStyles>; c: ReturnType<typeof useTheme>['c'] }) {
  return (
    <View style={st.statRow}>
      <View style={{ flex: 1 }}>
        <Text style={st.meta}>{label}</Text>
        {sub ? <Text style={st.sub}>{sub}</Text> : null}
      </View>
      <Text style={st.money}>{displayMoney(value)}</Text>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
    title: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4, marginBottom: 14 },
    range: { flexDirection: 'row', gap: 10 },
    label: { color: c.sub, fontSize: 11, fontFamily: font.bold, marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: c.card, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12, fontSize: 14, fontFamily: font.regular },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 14, marginBottom: 10 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, marginBottom: 10 },
    cardTitle: { color: c.text, fontSize: 13, fontFamily: font.extra, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: c.border },
    meta: { color: c.sub, fontSize: 11, fontFamily: font.regular },
    sub: { color: c.sub, fontSize: 9, fontFamily: font.regular, marginTop: 2 },
    money: { color: c.text, fontSize: 13, fontFamily: font.bold },
    center: { paddingVertical: 40, alignItems: 'center' },
  });
}
