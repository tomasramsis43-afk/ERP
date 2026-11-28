import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { lookupBarcode } from '../core/barcode';
import { Product } from '../core/cart';
import { isLowStock } from '../core/dashboard';
import { filterProducts } from '../core/search';
import { local } from '../db/database';
import { pick, t } from '../i18n';
import { Empty, Icon, IconBtn, Pill, Skeleton } from '../ui/kit';
import { BarcodeScanner } from './BarcodeScanner';
import { useTheme } from './theme';

export function ProductsScreen({ version }: { version: number }) {
  const { c } = useTheme();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [stock, setStock] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const deferred = useDeferredValue(q);

  useEffect(() => {
    void Promise.all([local.products(), local.vanStock()]).then(([p, s]) => { setProducts(p); setStock(s); });
  }, [version]);

  const data = useMemo(() => {
    const base = filterProducts(products ?? [], deferred, 200);
    return lowOnly ? base.filter((p) => isLowStock(stock.get(p.id))) : base;
  }, [products, deferred, lowOnly, stock]);

  function onScan(code: string) {
    const r = lookupBarcode(products ?? [], code);
    setScanning(false);
    if (r.kind === 'FOUND') { setQ(r.product.code); setOpen(r.product.id); }
    else Alert.alert(r.kind === 'UNKNOWN' ? t('unknownBarcode') : t('duplicateBarcode'), code);
  }

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.primary : c.card, borderWidth: 1, borderColor: active ? c.primary : c.border }}>
      <Text style={{ color: active ? c.onPrimary : c.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, minHeight: 48 }}>
          <Icon name="search" size={20} color={c.sub} />
          <TextInput style={{ flex: 1, color: c.text, fontSize: 16, padding: 0 }} placeholder={t('search')} placeholderTextColor={c.sub} value={q} onChangeText={setQ} autoCorrect={false} accessibilityLabel={t('search')} />
        </View>
        <IconBtn icon="scan" label={t('scan')} onPress={() => setScanning(true)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
        {chip(t('allWord'), !lowOnly, () => setLowOnly(false))}
        {chip(t('lowOnly'), lowOnly, () => setLowOnly(true))}
      </View>
      {products === null ? (
        <Skeleton rows={6} height={64} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          initialNumToRender={15}
          windowSize={7}
          ListEmptyComponent={<Empty icon="box" text={t('noResults')} />}
          renderItem={({ item }) => {
            const qty = stock.get(item.id);
            const low = isLowStock(qty);
            const expanded = open === item.id;
            return (
              <Pressable onPress={() => setOpen(expanded ? null : item.id)} accessibilityRole="button" style={{ backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{pick(item.nameAr, item.nameEn)}</Text>
                    <Text style={{ color: c.sub, fontSize: 13, marginTop: 2 }}>{item.code} · {t('stock')} {qty ?? '0'}</Text>
                  </View>
                  {low ? <Pill tone="warn" label={t('lowStock')} /> : null}
                </View>
                {expanded ? (
                  <View style={{ marginTop: 10, gap: 4 }}>
                    <Text style={{ color: c.text }}>{t('retailPrice')}: {item.retailPrice}</Text>
                    <Text style={{ color: c.text }}>{t('wholesalePrice')}: {item.wholesalePrice}</Text>
                    {item.units.map((u) => <Text key={u.unitId} style={{ color: c.sub, fontSize: 13 }}>{t('packUnit')} {u.factor}{u.barcode ? ` · ${u.barcode}` : ''}</Text>)}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
      <BarcodeScanner visible={scanning} onScan={onScan} onClose={() => setScanning(false)} />
    </View>
  );
}
