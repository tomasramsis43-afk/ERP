import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { customerStatus } from '../core/dashboard';
import { Customer, local } from '../db/database';
import { pick, t } from '../i18n';
import { Btn, Empty, Icon, Pill, Skeleton } from '../ui/kit';
import { Nav } from './nav';
import { useTheme } from './theme';

export function CustomersScreen({ version, nav }: { version: number; nav: Nav }) {
  const { c } = useTheme();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    void local.customers().then(setCustomers);
  }, [version]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (customers ?? []).filter((x) => !needle || `${x.code} ${x.nameAr} ${x.nameEn ?? ''} ${x.phone ?? ''}`.toLowerCase().includes(needle));
  }, [customers, q]);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, minHeight: 48 }}>
          <Icon name="search" size={20} color={c.sub} />
          <TextInput style={{ flex: 1, color: c.text, fontSize: 16, padding: 0 }} placeholder={t('search')} placeholderTextColor={c.sub} value={q} onChangeText={setQ} autoCorrect={false} accessibilityLabel={t('search')} />
        </View>
        <Btn label={t('addCustomer')} icon="userPlus" kind="outline" onPress={() => nav.open({ name: 'newCustomer' })} />
      </View>
      {customers === null ? (
        <Skeleton rows={5} height={72} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(x) => x.id}
          initialNumToRender={15}
          windowSize={7}
          ListEmptyComponent={<Empty icon="people" text={t('noData')} />}
          renderItem={({ item }) => {
            const st = customerStatus(item);
            return (
              <Pressable onPress={() => nav.open({ name: 'customer', id: item.id })} accessibilityRole="button" style={{ backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{pick(item.nameAr, item.nameEn)}</Text>
                  <Text style={{ color: c.sub, fontSize: 13, marginTop: 2 }}>{item.code} · {t('balance')} {item.balance}</Text>
                </View>
                <Pill tone={st === 'OVER_LIMIT' ? 'danger' : st === 'DUE' ? 'warn' : 'ok'} label={st === 'OVER_LIMIT' ? t('statusOver') : st === 'DUE' ? t('statusDue') : t('statusClear')} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
