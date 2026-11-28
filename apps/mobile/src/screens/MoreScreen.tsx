import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { t } from '../i18n';
import { Icon, IconName } from '../ui/kit';
import { Nav } from './nav';
import { useTheme } from './theme';

export function MoreScreen({ nav, pending, onLanguage, onLogout }: { nav: Nav; pending: number; onLanguage: () => void; onLogout: () => void }) {
  const { c } = useTheme();
  const item = (icon: IconName, label: string, onPress: () => void, extra?: string, danger?: boolean) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, backgroundColor: c.card, borderBottomWidth: 1, borderColor: c.border }}>
      <Icon name={icon} size={22} color={danger ? c.danger : c.primary} />
      <Text style={{ flex: 1, color: danger ? c.danger : c.text, fontSize: 16 }}>{label}</Text>
      {extra ? <Text style={{ color: c.warn, fontWeight: '700' }}>{extra}</Text> : null}
    </Pressable>
  );
  const group = (title: string, children: React.ReactNode) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginBottom: 8, marginHorizontal: 4 }}>{title}</Text>
      <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>{children}</View>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {group(t('sectionOps'), <>
        {item('undo', t('returns'), () => nav.open({ name: 'return' }))}
        {item('cash', t('collection'), () => nav.open({ name: 'collection' }))}
        {item('wallet', t('expense'), () => nav.open({ name: 'expense' }))}
        {item('userPlus', t('addCustomer'), () => nav.open({ name: 'newCustomer' }))}
      </>)}
      {group(t('sectionReports'), <>
        {item('van', t('vanStock'), () => nav.open({ name: 'vanStock' }))}
        {item('chart', t('daySummary'), () => nav.open({ name: 'summary' }))}
        {item('lock', t('closeDay'), () => nav.open({ name: 'close' }))}
        {item('sync', t('outbox'), () => nav.open({ name: 'sync' }), pending > 0 ? String(pending) : undefined)}
      </>)}
      {group(t('sectionAccount'), <>
        {item('globe', t('language'), onLanguage)}
        {item('logout', t('logout'), onLogout, undefined, true)}
      </>)}
    </ScrollView>
  );
}
