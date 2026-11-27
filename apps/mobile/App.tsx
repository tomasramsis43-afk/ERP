import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, Text, View } from 'react-native';
import { hasSession, logout } from './src/api/client';
import { Lang, getLang, setLang, t } from './src/i18n';
import { CollectionScreen } from './src/screens/CollectionScreen';
import { CloseDayScreen } from './src/screens/CloseDayScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SaleScreen } from './src/screens/SaleScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { useTheme } from './src/screens/theme';

type Tab = 'customers' | 'sale' | 'collection' | 'close' | 'sync';

export default function App() {
  const { s, c } = useTheme();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<Tab>('customers');
  const [saleCustomer, setSaleCustomer] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumped after each sync/save so screens reload local data
  const [, force] = useState(0);

  useEffect(() => {
    void hasSession().then((ok) => {
      setSignedIn(ok);
      setReady(true);
    });
  }, []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  function toggleLanguage() {
    const next: Lang = getLang() === 'ar' ? 'en' : 'ar';
    const needsReload = setLang(next);
    force((n) => n + 1);
    if (needsReload) Alert.alert(t('language'), 'Restart the app to apply the text direction.');
  }

  if (!ready) return null;
  if (!signedIn) return <LoginScreen onDone={() => setSignedIn(true)} />;

  const tabs: [Tab, string][] = [
    ['customers', t('customers')],
    ['sale', t('newSale')],
    ['collection', t('collection')],
    ['close', t('closeDay')],
    ['sync', t('outbox')],
  ];
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
        {tab === 'collection' && <CollectionScreen onSaved={() => { bump(); setTab('sync'); }} />}
        {tab === 'close' && <CloseDayScreen version={version} onClosed={bump} />}
        {tab === 'sync' && <SyncScreen onSynced={bump} />}
      </View>
      <View style={[s.row, { borderTopWidth: 1, borderColor: c.border }]}>
        {tabs.map(([key, label]) => (
          <Pressable key={key} style={{ flex: 1, padding: 14, alignItems: 'center' }} onPress={() => { if (key === 'sale') setSaleCustomer(null); setTab(key); }}>
            <Text style={{ color: tab === key ? c.primary : c.sub, fontWeight: tab === key ? '700' : '400' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
