import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { Product } from '../core/cart';
import { local } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

export function VanStockScreen({ version }: { version: number }) {
  const { s, c } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState('');

  useEffect(() => {
    void Promise.all([local.products(), local.vanStock()]).then(([p, st]) => {
      setProducts(p);
      setStock(st);
    });
  }, [version]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => Number(stock.get(p.id) ?? '0') > 0)
      .filter((p) => !needle || p.code.toLowerCase().includes(needle) || p.nameAr.toLowerCase().includes(needle) || (p.nameEn ?? '').toLowerCase().includes(needle));
  }, [products, stock, q]);

  return (
    <View style={s.screen}>
      <TextInput style={s.input} placeholder={t('search')} placeholderTextColor={c.sub} value={q} onChangeText={setQ} />
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={s.sub}>{t('noData')}</Text>}
        renderItem={({ item }) => (
          <View style={[s.card, s.row]}>
            <View style={{ flex: 1 }}>
              <Text style={s.text}>{pick(item.nameAr, item.nameEn)}</Text>
              <Text style={s.sub}>{item.code}</Text>
            </View>
            <Text style={s.text}>{stock.get(item.id)}</Text>
          </View>
        )}
      />
    </View>
  );
}
