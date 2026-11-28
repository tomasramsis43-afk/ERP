import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { displayMoney } from '../core/fieldDay';
import { RepProfile, local } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

export type MoreTab = 'return' | 'van' | 'summary' | 'close' | 'sync';

export function MoreScreen({
  version, onOpen, onOpenReport, onToggleLanguage, onLogout,
}: {
  version: number;
  onOpen: (tab: MoreTab) => void;
  onOpenReport: () => void;
  onToggleLanguage: () => void;
  onLogout: () => void;
}) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [rep, setRep] = useState<RepProfile | null>(null);

  useEffect(() => {
    void local.rep().then(setRep);
  }, [version]);

  const row = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, danger = false) => (
    <Pressable
      key={label}
      style={({ pressed }) => [st.row, pressed ? st.rowPressed : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[st.rowIcon, danger ? { backgroundColor: c.dangerSoft } : null]}>
        <Ionicons name={icon} size={19} color={danger ? c.danger : c.primary} />
      </View>
      <Text style={[st.rowLabel, danger ? { color: c.danger } : null]}>{label}</Text>
      <Ionicons name="chevron-back" size={16} color={c.sub} />
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      <View style={st.header}>
        <Text style={st.date}>{t('accountSection')}</Text>
        <Text style={st.title}>{t('more')}</Text>
      </View>

      <View style={st.profile}>
        <View style={st.avatar}><Ionicons name="person" size={20} color={c.primary} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{rep ? pick(rep.nameAr, rep.nameEn) : t('repRole')}</Text>
          <Text style={st.meta} numberOfLines={1}>
            {rep ? `${rep.code} · ${t('custody')} ${displayMoney(rep.custodyBalance)} ${t('currency')}` : t('noData')}
          </Text>
        </View>
        <View style={st.chip}><Text style={st.chipText}>{t('repRole')}</Text></View>
      </View>

      <Text style={st.section}>{t('operationsSection')}</Text>
      {row('return-down-back-outline', t('returns'), () => onOpen('return'))}
      {row('cube-outline', t('vanStock'), () => onOpen('van'))}
      {row('bar-chart-outline', t('daySummary'), () => onOpen('summary'))}
      {row('lock-closed-outline', t('closeDay'), () => onOpen('close'))}
      {row('sync-outline', t('outbox'), () => onOpen('sync'))}

      <Text style={st.section}>{t('reportTitle')}</Text>
      {row('bar-chart-outline', t('reportTitle'), onOpenReport)}

      <Text style={st.section}>{t('accountSection')}</Text>
      {row('language-outline', t('language'), onToggleLanguage)}
      {row('log-out-outline', t('logout'), onLogout, true)}
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
    header: { marginBottom: 14 },
    date: { color: c.sub, fontSize: 12, fontFamily: font.regular, marginBottom: 2 },
    title: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4 },
    profile: {
      flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderWidth: 1,
      borderColor: c.border, borderRadius: 20, padding: 14, marginBottom: 6,
    },
    avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
    name: { color: c.text, fontSize: 14, fontFamily: font.extra },
    meta: { color: c.sub, fontSize: 10, fontFamily: font.regular, marginTop: 3 },
    chip: { backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
    chipText: { color: c.primary, fontSize: 9, fontFamily: font.bold },
    section: { color: c.sub, fontSize: 11, fontFamily: font.bold, marginTop: 18, marginBottom: 8, marginHorizontal: 2 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderWidth: 1,
      borderColor: c.border, borderRadius: 16, padding: 12, marginBottom: 8,
    },
    rowPressed: { backgroundColor: c.cream },
    rowIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, color: c.text, fontSize: 13, fontFamily: font.bold },
  });
}
