import * as Crypto from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CartLine, Product, applySale, cartTotal } from '../core/cart';
import { OutboxItem } from '../core/outbox';
import { Receipt } from '../core/receipts';
import { Customer, local, saveOperation } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

const QTY = /^\d{1,10}(\.\d{1,4})?$/;

export function ReturnScreen({ onSaved }: { onSaved: () => void }) {
  const { s, c } = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Awaited<ReturnType<typeof local.prices>>>([]);
  const [stock, setStock] = useState<Map<string, string>>(new Map());
  const [customer, setCustomer] = useState<string | null>(null);
  const [condition, setCondition] = useState<'GOOD' | 'DAMAGED'>('GOOD');
  const [refund, setRefund] = useState<'CREDIT' | 'CASH'>('CREDIT');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState(false);
  const saving = useRef(false);

  useEffect(() => {
    void Promise.all([local.customers(), local.products(), local.prices(), local.vanStock()]).then(([cu, p, pr, st]) => {
      setCustomers(cu);
      setProducts(p);
      setPrices(pr);
      setStock(st);
    });
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const total = useMemo(() => (cart.length ? cartTotal(byId, cart, customer, prices, 'RETAIL') : '0.00'), [cart, byId, customer, prices]);

  async function save() {
    if (saving.current || cart.length === 0) return;
    if (refund === 'CREDIT' && !customer) return Alert.alert(t('selectCustomer'));
    if (cart.some((l) => !QTY.test(l.quantity) || Number(l.quantity) <= 0)) return Alert.alert(t('quantity'));

    const now = new Date();
    const opId = Crypto.randomUUID();
    const date = now.toISOString().slice(0, 10);
    const item: OutboxItem = {
      opId,
      type: 'RETURN',
      clientCreatedAt: now.toISOString(),
      status: 'PENDING',
      error: null,
      attempts: 0,
      payload: {
        invoiceDate: date,
        paymentKind: refund,
        condition,
        ...(customer ? { customerId: customer } : {}),
        lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      },
    };
    const who = customers.find((x) => x.id === customer);
    const receipt: Receipt = {
      opId,
      kind: condition === 'GOOD' ? 'RETURN_GOOD' : 'RETURN_DAMAGED',
      date,
      createdAt: now.toISOString(),
      customerId: customer,
      customerName: who ? pick(who.nameAr, who.nameEn) : null,
      lines: cart.map((l) => {
        const p = byId.get(l.productId)!;
        return { name: pick(p.nameAr, p.nameEn), quantity: l.quantity };
      }),
      total,
      cashRefund: refund === 'CASH',
    };
    saving.current = true;
    try {
      // Only good goods go back on the van (the server does the same); damaged goods are not restocked.
      await saveOperation(item, receipt, condition === 'GOOD' ? applySale(stock, byId, cart, 1) : undefined);
    } catch {
      saving.current = false;
      return Alert.alert(t('saveFailed'));
    }
    Alert.alert(t('savedOffline'));
    setCart([]);
    saving.current = false;
    onSaved();
  }

  const toggle = <T extends string>(options: [T, string][], value: T, set: (v: T) => void) => (
    <View style={s.row}>
      {options.map(([k, label]) => (
        <Pressable key={k} style={[s.ghost, { flex: 1, marginHorizontal: 4, backgroundColor: value === k ? c.primary : 'transparent' }]} onPress={() => set(k)}>
          <Text style={{ color: value === k ? '#fff' : c.text }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <ScrollView style={s.screen}>
      <Text style={s.title}>{t('returns')}</Text>
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
      {toggle<'GOOD' | 'DAMAGED'>([['GOOD', t('returnGood')], ['DAMAGED', t('returnDamaged')]], condition, setCondition)}
      {toggle<'CREDIT' | 'CASH'>([['CREDIT', t('returnCredit')], ['CASH', t('returnCash')]], refund, setRefund)}
      <Text style={s.sub}>{t('returnNote')}</Text>

      {cart.map((l) => {
        const p = byId.get(l.productId)!;
        return (
          <View key={l.productId} style={s.card}>
            <Text style={s.text}>{pick(p.nameAr, p.nameEn)}</Text>
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
      {picking
        ? products.map((p) => (
            <Pressable key={p.id} style={s.card} onPress={() => { setCart((cur) => (cur.some((l) => l.productId === p.id) ? cur : [...cur, { productId: p.id, quantity: '1' }])); setPicking(false); }}>
              <Text style={s.text}>{pick(p.nameAr, p.nameEn)}</Text>
              <Text style={s.sub}>{p.code}</Text>
            </Pressable>
          ))
        : null}

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
