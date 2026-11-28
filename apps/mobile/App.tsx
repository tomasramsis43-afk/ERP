import { useNetInfo } from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, SafeAreaView, Text, View } from 'react-native';
import { hasSession, logout, onSessionExpired } from './src/api/client';
import { databaseIsHealthy, store } from './src/db/database';
import { Lang, getLang, setLang, t } from './src/i18n';
import { CloseDayScreen } from './src/screens/CloseDayScreen';
import { CollectionScreen } from './src/screens/CollectionScreen';
import { CustomerScreen } from './src/screens/CustomerScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { DaySummaryScreen } from './src/screens/DaySummaryScreen';
import { ExpenseScreen } from './src/screens/ExpenseScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { Flow, Nav } from './src/screens/nav';
import { NewCustomerScreen } from './src/screens/NewCustomerScreen';
import { ProductsScreen } from './src/screens/ProductsScreen';
import { ReturnScreen } from './src/screens/ReturnScreen';
import { SaleScreen } from './src/screens/SaleScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { useTheme } from './src/screens/theme';
import { VanStockScreen } from './src/screens/VanStockScreen';
import { startAutoSync } from './src/sync/syncRunner';
import { Header, Icon, IconName, Pill } from './src/ui/kit';

type Tab = 'today' | 'customers' | 'products' | 'more';

const TABS: [Tab, IconName, 'today' | 'customers' | 'products' | 'more'][] = [
  ['today', 'home', 'today'],
  ['customers', 'people', 'customers'],
  ['products', 'box', 'products'],
  ['more', 'more', 'more'],
];

function flowTitle(f: Flow): string {
  switch (f.name) {
    case 'sale': return t('newSale');
    case 'customer': return t('customers');
    case 'collection': return t('collection');
    case 'return': return t('returns');
    case 'expense': return t('expense');
    case 'newCustomer': return t('addCustomer');
    case 'vanStock': return t('vanStock');
    case 'summary': return t('daySummary');
    case 'close': return t('closeDay');
    case 'sync': return t('outbox');
  }
}

export default function App() {
  const { c } = useTheme();
  const net = useNetInfo();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [stack, setStack] = useState<Flow[]>([]);
  const [version, setVersion] = useState(0); // bumped after each sync/save so screens reload local data
  const [pending, setPending] = useState(0);
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
    setStack([]);
    Alert.alert(t('sessionExpired'));
  }), []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => (signedIn ? startAutoSync(bump) : undefined), [signedIn, bump]);

  useEffect(() => {
    if (!signedIn) return;
    void store.loadOutbox().then((o) => setPending(o.filter((x) => x.status === 'PENDING').length)).catch(() => undefined);
  }, [signedIn, version]);

  // The system back button closes the open screen first, then returns to the first tab, then leaves the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 0) { setStack((s) => s.slice(0, -1)); return true; }
      if (tab !== 'today') { setTab('today'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, tab]);

  function toggleLanguage() {
    const next: Lang = getLang() === 'ar' ? 'en' : 'ar';
    const needsReload = setLang(next);
    force((n) => n + 1);
    if (needsReload) Alert.alert(t('language'), 'Restart the app to apply the text direction.');
  }

  if (!ready) return null;
  if (!signedIn) return <LoginScreen onDone={() => setSignedIn(true)} />;

  const nav: Nav = { open: (f) => setStack((s) => [...s, f]) };
  const pop = () => setStack((s) => s.slice(0, -1));
  const done = () => { bump(); pop(); };
  const top = stack[stack.length - 1];

  const body = top ? (
    <View style={{ flex: 1 }}>
      <Header title={flowTitle(top)} onBack={pop} />
      <View style={{ flex: 1 }}>
        {top.name === 'sale' && <SaleScreen key={top.customerId ?? 'none'} customerId={top.customerId ?? null} onSaved={bump} onClose={() => setStack([])} />}
        {top.name === 'customer' && <CustomerScreen id={top.id} nav={nav} onChanged={bump} />}
        {top.name === 'collection' && <CollectionScreen customerId={top.customerId} onSaved={done} />}
        {top.name === 'return' && <ReturnScreen customerId={top.customerId} onSaved={done} />}
        {top.name === 'expense' && <ExpenseScreen onSaved={done} />}
        {top.name === 'newCustomer' && <NewCustomerScreen onSaved={done} />}
        {top.name === 'vanStock' && <VanStockScreen version={version} />}
        {top.name === 'summary' && <DaySummaryScreen version={version} />}
        {top.name === 'close' && <CloseDayScreen version={version} onClosed={bump} />}
        {top.name === 'sync' && <SyncScreen onSynced={bump} />}
      </View>
    </View>
  ) : (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
        <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{t(TABS.find((x) => x[0] === tab)![2])}</Text>
        {net.isConnected === false ? <Pill tone="warn" label={`${t('offlineShort')}${pending > 0 ? ` · ${pending} ${t('waitingOps')}` : ''}`} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'today' && <TodayScreen version={version} nav={nav} />}
        {tab === 'customers' && <CustomersScreen version={version} nav={nav} />}
        {tab === 'products' && <ProductsScreen version={version} />}
        {tab === 'more' && <MoreScreen nav={nav} pending={pending} onLanguage={toggleLanguage} onLogout={async () => { await logout(); setSignedIn(false); }} />}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: c.card, borderTopWidth: 1, borderColor: c.border, paddingHorizontal: 8 }}>
        {TABS.map(([key, icon, label]) => {
          const active = tab === key;
          return (
            <Pressable key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t(label)} style={{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <View>
                <Icon name={icon} size={24} color={active ? c.primary : c.sub} />
                {key === 'more' && pending > 0 ? <View style={{ position: 'absolute', top: -2, end: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: c.warn }} /> : null}
              </View>
              <Text style={{ color: active ? c.primary : c.sub, fontSize: 12, fontWeight: active ? '700' : '600' }}>{t(label)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="auto" />
      {body}
    </SafeAreaView>
  );
}
