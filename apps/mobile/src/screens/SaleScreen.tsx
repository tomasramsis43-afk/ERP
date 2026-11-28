import * as Crypto from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CartLine, CustomerPrice, Product, applySale, estimateCartTotal, isPositiveQuantity, lineTotal, stockShortages } from '../core/cart';
import { format } from '../core/money';
import { OutboxItem } from '../core/outbox';
import { Receipt } from '../core/receipts';
import { Customer, local, saveOperation } from '../db/database';
import { pick, t } from '../i18n';
import { ProductPicker } from './ProductPicker';
import { useTheme } from './theme';

export function SaleScreen({ customerId, onSaved }: { customerId: string | null; onSaved: () => void }) {
  const { s, c } = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<CustomerPrice[]>([]);
  const [stock, setStock] = useState<Map<string, string>>(new Map());
  const [customer, setCustomer] = useState<string | null>(customerId);
  const [kind, setKind] = useState<'CASH' | 'CREDIT'>('CASH');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState(false);
  const saving = useRef(false); // blocks a second tap while the first save is still running

  useEffect(() => {
    void Promise.all([local.customers(), local.products(), local.prices(), local.vanStock()]).then(([cu, p, pr, st]) => {
      setCustomers(cu);
      setProducts(p);
      setPrices(pr);
      setStock(st);
    });
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const total = useMemo(() => estimateCartTotal(byId, cart, customer, prices, 'RETAIL'), [cart, byId, customer, prices]);

  function add(p: Product, unitId?: string) {
    setCart((cur) => (cur.some((l) => l.productId === p.id) ? cur : [...cur, { productId: p.id, quantity: '1', ...(unitId ? { unitId } : {}) }]));
    setPicking(false);
  }

  async function save() {
    if (saving.current || cart.length === 0) return;
    if (kind === 'CREDIT' && !customer) return Alert.alert(t('selectCustomer'));
    if (cart.some((l) => !isPositiveQuantity(l.quantity))) return Alert.alert(t('quantity'));
    if (stockShortages(byId, cart, stock).length) return Alert.alert(t('insufficientStock'));

    const now = new Date();
    // The operation id is created once, here. Every retry of this sale reuses it, so the server can never create it twice.
    const opId = Crypto.randomUUID();
    const item: OutboxItem = {
      opId,
      type: 'SALE',
      clientCreatedAt: now.toISOString(),
      status: 'PENDING',
      error: null,
      attempts: 0,
      payload: {
        invoiceDate: now.toISOString().slice(0, 10),
        paymentKind: kind,
        ...(customer ? { customerId: customer } : {}),
        lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, ...(l.unitId ? { unitId: l.unitId } : {}) })),
      },
    };
    const who = customers.find((x) => x.id === customer);
    const receipt: Receipt = {
      opId,
      kind: kind === 'CASH' ? 'CASH_SALE' : 'CREDIT_SALE',
      date: now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
      customerId: customer,
      customerName: who ? pick(who.nameAr, who.nameEn) : null,
      lines: cart.map((l) => {
        const p = byId.get(l.productId)!;
        return { name: pick(p.nameAr, p.nameEn), quantity: l.quantity, amount: format(lineTotal(p, l, customer, prices, 'RETAIL'), 2) };
      }),
      total,
    };
    saving.current = true;
    try {
      // One atomic write; the van stock is updated so the next offline sale sees what is really left.
      await saveOperation(item, receipt, applySale(stock, byId, cart));
    } catch {
      saving.current = false;
      return Alert.alert(t('saveFailed'));
    }
    Alert.alert(t('savedOffline'));
    setCart([]);
    saving.current = false;
    onSaved();
  }

  return (
    <ScrollView style={s.screen}>
      <Text style={s.title}>{t('newSale')}</Text>

      <Text style={s.sub}>{t('selectCustomer')}</Text>
      <FlatList
        horizontal
        data={customers}
        keyExtractor={(x) => x.id}
        style={{ marginBottom: 10 }}
        renderItem={({ item }) => (
          <Pressable style={[s.ghost, { marginEnd: 8, backgroundColor: customer === item.id ? c.primary : 'transparent' }]} onPress={() => setCustomer(customer === item.id ? null : item.id)}>
            <Text style={{ color: customer === item.id ? '#fff' : c.text }}>{pick(item.nameAr, item.nameEn)}</Text>
          </Pressable>
        )}
      />

      <View style={s.row}>
        {(['CASH', 'CREDIT'] as const).map((k) => (
          <Pressable key={k} style={[s.ghost, { flex: 1, marginHorizontal: 4, backgroundColor: kind === k ? c.primary : 'transparent' }]} onPress={() => setKind(k)}>
            <Text style={{ color: kind === k ? '#fff' : c.text }}>{k === 'CASH' ? t('cash') : t('credit')}</Text>
          </Pressable>
        ))}
      </View>

      {cart.map((l) => {
        const p = byId.get(l.productId)!;
        return (
          <View key={l.productId} style={s.card}>
            <Text style={s.text}>{pick(p.nameAr, p.nameEn)}</Text>
            {l.unitId ? <Text style={s.sub}>{t('packUnit')} {p.units.find((u) => u.unitId === l.unitId)?.factor ?? '?'}</Text> : null}
            <Text style={s.sub}>{t('van')}: {stock.get(p.id) ?? '0'}</Text>
            <View style={s.row}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                keyboardType="decimal-pad"
                value={l.quantity}
                onChangeText={(v) => setCart((cur) => cur.map((x) => (x.productId === l.productId ? { ...x, quantity: v } : x)))}
              />
              <Pressable style={[s.ghost, { marginStart: 8 }]} onPress={() => setCart((cur) => cur.filter((x) => x.productId !== l.productId))}>
                <Text style={{ color: c.danger }}>✕</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable style={s.ghost} onPress={() => setPicking(!picking)}>
        <Text style={{ color: c.primary }}>{t('addProduct')}</Text>
      </Pressable>
      <ProductPicker
        visible={picking}
        products={products}
        stock={stock}
        onPick={add}
        onClose={() => setPicking(false)}
      />

      <View style={[s.card, s.row]}>
        <Text style={s.text}>{t('total')}</Text>
        <Text style={s.text}>{total}</Text>
      </View>
      <Text style={s.sub}>{t('estimate')}</Text>
      <Pressable style={s.button} onPress={save}>
        <Text style={s.buttonText}>{t('save')}</Text>
      </Pressable>
    </ScrollView>
  );
}
