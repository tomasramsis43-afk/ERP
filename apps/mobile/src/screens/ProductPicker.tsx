import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';
import { Product } from '../core/cart';
import { filterProducts } from '../core/search';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

/** Full-screen product chooser: virtualized list + Arabic/English/code search, so thousands of products stay fast. */
export function ProductPicker({
  visible, products, stock, onPick, onClose,
}: {
  visible: boolean;
  products: Product[];
  stock?: Map<string, string>;
  onPick: (p: Product) => void;
  onClose: () => void;
}) {
  const { s, c } = useTheme();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const data = useMemo(() => filterProducts(products, deferred, 100), [products, deferred]);

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
      </SafeAreaView>
    </Modal>
  );
}
