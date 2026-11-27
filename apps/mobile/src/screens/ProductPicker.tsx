import React, { useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';
import { lookupBarcode } from '../core/barcode';
import { Product } from '../core/cart';
import { filterProducts } from '../core/search';
import { pick, t } from '../i18n';
import { BarcodeScanner } from './BarcodeScanner';
import { useTheme } from './theme';

/** Full-screen product chooser: virtualized list + Arabic/English/code search, so thousands of products stay fast. */
export function ProductPicker({
  visible, products, stock, onPick, onClose,
}: {
  visible: boolean;
  products: Product[];
  stock?: Map<string, string>;
  onPick: (p: Product, unitId?: string) => void;
  onClose: () => void;
}) {
  const { s, c } = useTheme();
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const deferred = useDeferredValue(query);
  const data = useMemo(() => filterProducts(products, deferred, 100), [products, deferred]);

  function onScan(code: string) {
    const r = lookupBarcode(products, code);
    if (r.kind === 'FOUND') {
      setScanning(false);
      onPick(r.product, r.unitId);
    } else {
      Alert.alert(r.kind === 'UNKNOWN' ? t('unknownBarcode') : t('duplicateBarcode'), code);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[s.row, { padding: 12 }]}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            placeholder={t('search')}
            placeholderTextColor={c.sub}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
          />
          <Pressable style={[s.ghost, { marginStart: 8 }]} onPress={() => setScanning(true)} accessibilityRole="button" accessibilityLabel={t('scan')}>
            <Text style={{ color: c.primary }}>▦</Text>
          </Pressable>
          <Pressable style={[s.ghost, { marginStart: 8 }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')}>
            <Text style={{ color: c.danger }}>✕</Text>
          </Pressable>
        </View>
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={15}
          windowSize={7}
          contentContainerStyle={{ paddingHorizontal: 12 }}
          ListEmptyComponent={<Text style={s.sub}>{t('noResults')}</Text>}
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => { onPick(item); setQuery(''); }}>
              <Text style={s.text}>{pick(item.nameAr, item.nameEn)}</Text>
              <Text style={s.sub}>{item.code}{stock ? ` · ${t('van')}: ${stock.get(item.id) ?? '0'}` : ''}</Text>
            </Pressable>
          )}
        />
        <BarcodeScanner visible={scanning} onScan={onScan} onClose={() => setScanning(false)} />
      </SafeAreaView>
    </Modal>
  );
}
