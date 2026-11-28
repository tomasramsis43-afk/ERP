import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/cairo';
import { useNetInfo } from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { hasSession, logout, onSessionExpired } from './src/api/client';
import { BottomNav, NavKey } from './src/components/BottomNav';
import { startAutoSync } from './src/sync/syncRunner';
import { databaseIsHealthy } from './src/db/database';
import { Lang, getLang, setLang, t } from './src/i18n';
import { hasPin } from './src/core/pin';
import { CollectionScreen } from './src/screens/CollectionScreen';
import { CloseDayScreen } from './src/screens/CloseDayScreen';
import { CustomerDetailScreen } from './src/screens/CustomerDetailScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { ExpenseScreen } from './src/screens/ExpenseScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { DaySummaryScreen } from './src/screens/DaySummaryScreen';
import { PhotoCaptureScreen } from './src/screens/PhotoCaptureScreen';
import { PinLockScreen } from './src/screens/PinLockScreen';
import { PinSetupScreen } from './src/screens/PinSetupScreen';
import { NewCustomerScreen } from './src/screens/NewCustomerScreen';
import { NotificationCenterScreen } from './src/screens/NotificationCenterScreen';
import { RepReportScreen } from './src/screens/RepReportScreen';
import { ReturnScreen } from './src/screens/ReturnScreen';
import { SaleScreen } from './src/screens/SaleScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { TargetSetupScreen } from './src/screens/TargetSetupScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { VanStockScreen } from './src/screens/VanStockScreen';
import { VisitScreen } from './src/screens/VisitScreen';
import { MoreScreen, MoreTab } from './src/screens/MoreScreen';
import { useTheme } from './src/screens/theme';

type Tab = 'today' | 'customers' | 'sale' | 'return' | 'collection' | 'van' | 'summary' | 'close' | 'sync' | 'more' | 'visit' | 'expense' | 'newCustomer' | 'customerDetail' | 'repReport' | 'pinSetup' | 'targetSetup' | 'photoCapture' | 'notifications';

const MORE_TABS: MoreTab[] = ['return', 'van', 'summary', 'close', 'sync'];

/** Which bottom-bar item is highlighted for each screen. */
function navFor(tab: Tab): NavKey {
  if (tab === 'today' || tab === 'customers' || tab === 'sale' || tab === 'collection') return tab;
  return 'more';
}

export default function App() {
  const { c } = useTheme();
  const net = useNetInfo();
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Cairo_800ExtraBold,
  });
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [saleCustomer, setSaleCustomer] = useState<string | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<string | null>(null);
  const [visitCustomer, setVisitCustomer] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumped after each sync/save so screens reload local data
  const [, force] = useState(0);

  useEffect(() => {
    void hasSession().then((ok) => {
      setSignedIn(ok);
      setReady(true);
    });
    void hasPin().then(setLocked);
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

  const afterSave = useCallback(() => {
    bump();
    setTab('today');
  }, [bump]);

  if (!ready || (!fontsLoaded && !fontError)) return null;
  if (!signedIn) return <LoginScreen onDone={() => setSignedIn(true)} />;
  if (locked) return <PinLockScreen onUnlock={() => setLocked(false)} />;

  const selectNav = (key: NavKey) => {
    if (key === 'sale') setSaleCustomer(null);
    setTab(key);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="auto" />
      {net.isConnected === false && (
        <View style={{ backgroundColor: c.danger, paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 12 }}>{t('offline')} — {t('offlineHint')}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        {tab === 'today' && (
          <TodayScreen
            version={version}
            onNewSale={(id) => { setSaleCustomer(id ?? null); setTab('sale'); }}
            onCollection={() => setTab('collection')}
            onReturn={() => setTab('return')}
            onCustomer={(id) => { setDetailCustomer(id); setTab('customerDetail'); }}
            onVisit={(id) => { setVisitCustomer(id ?? null); setTab('visit'); }}
            onExpense={() => setTab('expense')}
            onNewCustomer={() => setTab('newCustomer')}
            onCloseDay={() => setTab('close')}
            onSetTarget={() => setTab('targetSetup')}
            onCustomers={() => setTab('customers')}
            onSync={() => setTab('sync')}
          />
        )}
        {tab === 'customers' && <CustomersScreen version={version} onSell={(id) => { setSaleCustomer(id); setTab('sale'); }} onOpen={(id) => { setDetailCustomer(id); setTab('customerDetail'); }} />}
        {tab === 'sale' && <SaleScreen key={saleCustomer ?? 'none'} customerId={saleCustomer} onSaved={afterSave} />}
        {tab === 'return' && <ReturnScreen onSaved={afterSave} />}
        {tab === 'van' && <VanStockScreen version={version} />}
        {tab === 'summary' && <DaySummaryScreen version={version} />}
        {tab === 'collection' && <CollectionScreen onSaved={afterSave} />}
        {tab === 'close' && <CloseDayScreen version={version} onClosed={bump} />}
        {tab === 'sync' && <SyncScreen onSynced={bump} />}
        {tab === 'visit' && <VisitScreen customerId={visitCustomer} onSaved={afterSave} />}
        {tab === 'expense' && <ExpenseScreen onSaved={afterSave} />}
        {tab === 'newCustomer' && <NewCustomerScreen onSaved={afterSave} />}
        {tab === 'customerDetail' && detailCustomer && (
          <CustomerDetailScreen
            customerId={detailCustomer}
            onSell={(id) => { setSaleCustomer(id); setTab('sale'); }}
            onVisit={(id) => { setVisitCustomer(id); setTab('visit'); }}
            onCapturePhoto={(id) => { setDetailCustomer(id); setTab('photoCapture'); }}
            onBack={() => setTab('customers')}
          />
        )}
        {tab === 'repReport' && <RepReportScreen />}
        {tab === 'pinSetup' && <PinSetupScreen onDone={() => setTab('more')} />}
        {tab === 'notifications' && <NotificationCenterScreen onOpenSync={() => setTab('sync')} />}
        {tab === 'more' && (
          <MoreScreen
            version={version}
            onOpen={(next) => { if (MORE_TABS.includes(next)) setTab(next); }}
            onOpenReport={() => setTab('repReport')}
            onSetPin={() => setTab('pinSetup')}
            onSetTarget={() => setTab('targetSetup')}
            onOpenNotifications={() => setTab('notifications')}
            onToggleLanguage={toggleLanguage}
            onLogout={async () => { await logout(); setSignedIn(false); }}
          />
        )}
      </View>
      <BottomNav active={navFor(tab)} onSelect={selectNav} />
    </SafeAreaView>
  );
}
