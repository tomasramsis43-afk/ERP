import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, Text, View } from 'react-native';
import { hasSession, logout, onSessionExpired } from './src/api/client';
import { startAutoSync } from './src/sync/syncRunner';
import { databaseIsHealthy } from './src/db/database';
import { Lang, getLang, setLang, t } from './src/i18n';
import { CollectionScreen } from './src/screens/CollectionScreen';
import { CloseDayScreen } from './src/screens/CloseDayScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { DaySummaryScreen } from './src/screens/DaySummaryScreen';
import { ReturnScreen } from './src/screens/ReturnScreen';
import { SaleScreen } from './src/screens/SaleScreen';
import { VanStockScreen } from './src/screens/VanStockScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { useTheme } from './src/screens/theme';

type Tab = 'customers' | 'sale' | 'return' | 'collection' | 'van' | 'summary' | 'close' | 'sync';

export default function App() {
  const { s, c } = useTheme();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<Tab>('customers');
  const [saleCustomer, setSaleCustomer] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [version, setVersion] = useState(0); // bumped after each sync/save so screens reload local data
  const [, force] = useState(0);

  useEffect(() => {
    void hasSession().then((ok) => {
      setSignedIn(ok);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    // Warn, never repair or delete: unsent operations may still be readable and must not be lost.
    void databaseIsHealthy().then((ok) => { if (!ok) Alert.alert(t('dbDamaged')); }).catch(() => Alert.alert(t('dbDamaged')));
  }, []);

  useEffect(() => onSessionExpired(() => {
    setSignedIn(false);
    Alert.alert(t('sessionExpired'));
  }), []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => (signedIn ? startAutoSync(bump) : undefined), [signedIn, bump]);

  function toggleLanguage() {
    const next: Lang = getLang() === 'ar' ? 'en' : 'ar';
    const needsReload = setLang(next);
    force((n) => n + 1);
    if (needsReload) Alert.alert(t('language'), 'Restart the app to apply the text direction.');
  }

  if (!ready) return null;
  if (!signedIn) return <LoginScreen onDone={() => setSignedIn(true)} />;

  // Four everyday tabs plus "More": eight side-by-side tabs were too crowded for one-handed use.
  const mainTabs: [Tab, string][] = [
    ['customers', t('customers')],
    ['sale', t('newSale')],
    ['collection', t('collection')],
    ['sync', t('outbox')],
  ];
  const moreTabs: [Tab, string][] = [
    ['return', t('returns')],
    ['van', t('vanStock')],
    ['summary', t('daySummary')],
    ['close', t('closeDay')],
  ];
  const inMore = moreTabs.some(([k]) => k === tab);
  const go = (key: Tab) => {
    if (key === 'sale') setSaleCustomer(null);
    setTab(key);
    setMoreOpen(false);
  };
  const navItem = (key: string, label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text numberOfLines={1} style={{ color: active ? c.primary : c.sub, fontWeight: active ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="auto" />
      <View style={[s.row, { padding: 8 }]}>
        <Pressable onPress={toggleLanguage}><Text style={{ color: c.primary }}>{t('language')}</Text></Pressable>
        <Pressable onPress={async () => { await logout(); setSignedIn(false); }}><Text style={{ color: c.danger }}>{t('logout')}</Text></Pressable>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'customers' && <CustomersScreen version={version} onSell={(id) => { setSaleCustomer(id); setTab('sale'); }} />}
        {tab === 'sale' && <SaleScreen key={saleCustomer ?? 'none'} customerId={saleCustomer} onSaved={() => { bump(); setTab('sync'); }} />}
        {tab === 'return' && <ReturnScreen onSaved={() => { bump(); setTab('sync'); }} />}
        {tab === 'van' && <VanStockScreen version={version} />}
        {tab === 'summary' && <DaySummaryScreen version={version} />}
        {tab === 'collection' && <CollectionScreen onSaved={() => { bump(); setTab('sync'); }} />}
        {tab === 'close' && <CloseDayScreen version={version} onClosed={bump} />}
        {tab === 'sync' && <SyncScreen onSynced={bump} />}
      </View>
      {moreOpen ? (
        <View style={{ borderTopWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
          {moreTabs.map(([key, label]) => (
            <Pressable key={key} style={{ minHeight: 52, justifyContent: 'center', paddingHorizontal: 20 }} onPress={() => go(key)} accessibilityRole="button">
              <Text style={{ color: tab === key ? c.primary : c.text, fontWeight: tab === key ? '700' : '400' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: c.border }}>
        {mainTabs.map(([key, label]) => navItem(key, label, tab === key && !moreOpen, () => go(key)))}
        {navItem('more', t('more'), inMore || moreOpen, () => setMoreOpen((o) => !o))}
      </View>
    </SafeAreaView>
  );
}
