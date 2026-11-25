import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Customer, RepProfile, local } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

export function CustomersScreen({ onSell, version }: { onSell: (customerId: string) => void; version: number }) {
  const { s, c } = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rep, setRep] = useState<RepProfile | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    void local.customers().then(setCustomers);
    void local.rep().then(setRep);
  }, [version]);

  const shown = customers.filter((x) => `${x.code} ${x.nameAr} ${x.nameEn ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={s.screen}>
      {rep ? (
        <View style={s.card}>
          <Text style={s.text}>{pick(rep.nameAr, rep.nameEn)}</Text>
          <Text style={s.sub}>{t('custody')}: {rep.custodyBalance}</Text>
        </View>
      ) : null}
      <TextInput style={s.input} placeholder={t('search')} placeholderTextColor={c.sub} value={q} onChangeText={setQ} />
      <FlatList
        data={shown}
        keyExtractor={(x) => x.id}
        ListEmptyComponent={<Text style={s.sub}>{t('noData')}</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => onSell(item.id)}>
            <Text style={s.text}>{pick(item.nameAr, item.nameEn)}</Text>
            <View style={s.row}>
              <Text style={s.sub}>{item.code}</Text>
              <Text style={s.sub}>{t('balance')}: {item.balance} / {t('creditLimit')}: {item.creditLimit}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
