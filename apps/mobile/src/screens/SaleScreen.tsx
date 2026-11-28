import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CartLine, CustomerPrice, Product, applySale, estimateCartTotal, isPositiveQuantity, lineTotal, stockShortages } from '../core/cart';
import { customerStatus, displayMoney } from '../core/fieldDay';
import { format } from '../core/money';
import { OutboxItem } from '../core/outbox';
import { Receipt } from '../core/receipts';
import { Customer, local, saveOperation } from '../db/database';
import { pick, t } from '../i18n';
import { ProductPicker } from './ProductPicker';
import { useTheme } from './theme';

type Payment = 'CASH' | 'CREDIT';

/** One tap on + or −. Keeps up to four decimals and never goes below zero; partial typing stays untouched. */
function stepQty(current: string, delta: number): string {
  const n = Number(current);
  if (!Number.isFinite(n)) return current;
  const next = Math.max(0, n + delta);
  return String(Number(next.toFixed(4)));
}

export function SaleScreen({ customerId, onSaved }: { customerId: string | null; onSaved: () => void }) {
  const { c, font } = useTheme();
  const st = useMemo(() => makeStyles(c, font), [c, font]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<CustomerPrice[]>([]);
  const [stock, setStock] = useState<Map<string, string>>(new Map());
  const [customer, setCustomer] = useState<string | null>(customerId);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const saving = useRef(false); // blocks a second tap while the first save is still running

  useEffect(() => {
    void Promise.all([local.customers(), local.products(), local.prices(), local.vanStock()]).then(([cu, p, pr, stk]) => {
      setCustomers(cu);
      setProducts(p);
      setPrices(pr);
      setStock(stk);
    });
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const total = useMemo(() => estimateCartTotal(byId, cart, customer, prices, 'RETAIL'), [cart, byId, customer, prices]);
  const who = useMemo(() => customers.find((x) => x.id === customer) ?? null, [customers, customer]);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? customers.filter((x) => `${x.code} ${x.nameAr} ${x.nameEn ?? ''} ${x.phone ?? ''}`.toLowerCase().includes(needle))
      : customers;
    return list.slice(0, 30);
  }, [customers, q]);

  function add(p: Product, unitId?: string) {
    setCart((cur) => (cur.some((l) => l.productId === p.id) ? cur : [...cur, { productId: p.id, quantity: '1', ...(unitId ? { unitId } : {}) }]));
    setPicking(false);
  }

  function unitPrice(p: Product): string {
    return format(lineTotal(p, { productId: p.id, quantity: '1' }, customer, prices, 'RETAIL'), 2);
  }

  async function save(payment: Payment) {
    if (saving.current || cart.length === 0) return;
    if (payment === 'CREDIT' && !customer) return Alert.alert(t('selectCustomer'));
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
        paymentKind: payment,
        ...(customer ? { customerId: customer } : {}),
        lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, ...(l.unitId ? { unitId: l.unitId } : {}) })),
      },
    };
    const receipt: Receipt = {
      opId,
      kind: payment === 'CASH' ? 'CASH_SALE' : 'CREDIT_SALE',
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

  const step = cart.length === 0 ? 2 : 3;
  const status = who ? customerStatus(who) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={st.head}>
          <Text style={st.title}>{t('newSale')}</Text>
          <View style={st.steps}>
            {[1, 2, 3].map((n) => <View key={n} style={[st.step, n <= step ? st.stepOn : null, n === step ? st.stepCurrent : null]} />)}
          </View>
        </View>

        {who ? (
          <View style={st.customerCard}>
            <View style={st.avatar}><Text style={st.avatarText}>{(who.nameAr || who.code).trim().charAt(0)}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.customerName} numberOfLines={1}>{pick(who.nameAr, who.nameEn)}</Text>
              <Text style={st.meta} numberOfLines={1}>
                {t('balance')} {displayMoney(who.balance)} · {t('creditLimit')} {displayMoney(who.creditLimit)}
              </Text>
            </View>
            {status && status !== 'PAID' ? (
              <View style={[st.chip, { backgroundColor: c.dangerSoft }]}>
                <Text style={[st.chipText, { color: c.danger }]}>{status === 'OVER_LIMIT' ? t('overLimit') : t('due')}</Text>
              </View>
            ) : null}
            <Pressable onPress={() => setCustomer(null)} hitSlop={8} accessibilityRole="button">
              <Text style={st.change}>{t('change')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={st.card}>
            <Text style={st.cardTitle}>{t('selectCustomer')}</Text>
            <View style={st.search}>
              <Ionicons name="search-outline" size={17} color={c.sub} />
              <TextInput
                style={st.searchInput}
                placeholder={t('searchCustomers')}
                placeholderTextColor={c.sub}
                value={q}
                onChangeText={setQ}
                autoCorrect={false}
              />
            </View>
            {matches.length === 0 ? (
              <Text style={st.meta}>{t('noResults')}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 2 }}>
                {matches.map((item) => (
                  <Pressable key={item.id} style={st.personChip} onPress={() => setCustomer(item.id)} accessibilityRole="button">
                    <Text style={st.personName} numberOfLines={1}>{pick(item.nameAr, item.nameEn)}</Text>
                    <Text style={st.personMeta} numberOfLines={1}>{displayMoney(item.balance)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        <View style={st.itemsHead}>
          <Text style={st.section}>{t('cartItems')} · {cart.length} {t('itemsCount')}</Text>
          <Pressable style={st.addBtn} onPress={() => setPicking(true)} accessibilityRole="button">
            <Ionicons name="add" size={16} color={c.primary} />
            <Text style={st.addBtnText}>{t('addProduct')}</Text>
          </Pressable>
        </View>

        {cart.length === 0 ? (
          <Pressable style={st.empty} onPress={() => setPicking(true)} accessibilityRole="button">
            <Ionicons name="basket-outline" size={26} color={c.primary} />
            <Text style={st.emptyText}>{t('addProduct')}</Text>
          </Pressable>
        ) : (
          cart.map((l) => {
            const p = byId.get(l.productId)!;
            const available = stock.get(p.id) ?? '0';
            return (
              <View key={l.productId} style={st.product}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.productName} numberOfLines={1}>{pick(p.nameAr, p.nameEn)}</Text>
                  <Text style={st.meta} numberOfLines={1}>
                    {unitPrice(p)} {t('currency')} · {t('available')} {available}
                  </Text>
                  {l.unitId ? <Text style={st.meta}>{t('packUnit')} {p.units.find((u) => u.unitId === l.unitId)?.factor ?? '?'}</Text> : null}
                </View>
                <View style={st.stepper}>
                  <Pressable
                    style={st.stepBtn}
                    onPress={() => setCart((cur) => cur.map((x) => (x.productId === l.productId ? { ...x, quantity: stepQty(x.quantity, -1) } : x)))}
                    accessibilityRole="button"
                    accessibilityLabel="-"
                  >
                    <Text style={st.stepSign}>−</Text>
                  </Pressable>
                  <TextInput
                    style={st.qty}
                    keyboardType="decimal-pad"
                    value={l.quantity}
                    selectTextOnFocus
                    onChangeText={(v) => setCart((cur) => cur.map((x) => (x.productId === l.productId ? { ...x, quantity: v } : x)))}
                  />
                  <Pressable
                    style={[st.stepBtn, st.stepPlus]}
                    onPress={() => setCart((cur) => cur.map((x) => (x.productId === l.productId ? { ...x, quantity: stepQty(x.quantity, 1) } : x)))}
                    accessibilityRole="button"
                    accessibilityLabel="+"
                  >
                    <Text style={[st.stepSign, { color: '#fff' }]}>+</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={st.remove}
                  onPress={() => setCart((cur) => cur.filter((x) => x.productId !== l.productId))}
                  accessibilityRole="button"
                  accessibilityLabel={t('discard')}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={15} color={c.sub} />
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={st.footer}>
        <View style={st.totalRow}>
          <Text style={st.totalLabel}>{t('total')}</Text>
          <Text style={st.totalValue}>{displayMoney(total)} <Text style={st.totalUnit}>{t('currency')}</Text></Text>
        </View>
        <View style={st.actions}>
          <Pressable
            style={[st.payBtn, st.creditBtn, cart.length === 0 ? st.payDisabled : null]}
            onPress={() => void save('CREDIT')}
            disabled={cart.length === 0}
            accessibilityRole="button"
          >
            <Text style={st.creditText}>{t('credit')}</Text>
          </Pressable>
          <Pressable
            style={[st.payBtn, st.cashBtn, cart.length === 0 ? st.payDisabled : null]}
            onPress={() => void save('CASH')}
            disabled={cart.length === 0}
            accessibilityRole="button"
          >
            <Text style={st.cashText}>{t('confirmCash')}</Text>
          </Pressable>
        </View>
      </View>

      <ProductPicker
        visible={picking}
        products={products}
        stock={stock}
        onPick={add}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    title: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4 },
    steps: { flexDirection: 'row', gap: 5, alignItems: 'center' },
    step: { width: 18, height: 5, borderRadius: 99, backgroundColor: c.border },
    stepOn: { backgroundColor: c.primary },
    stepCurrent: { width: 28 },
    customerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 13, marginBottom: 10 },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 13, marginBottom: 10 },
    cardTitle: { color: c.text, fontSize: 13, fontFamily: font.extra, marginBottom: 8 },
    avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: c.primary, fontSize: 16, fontFamily: font.extra },
    customerName: { color: c.text, fontSize: 13, fontFamily: font.extra },
    meta: { color: c.sub, fontSize: 10, fontFamily: font.regular, marginTop: 3 },
    chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    chipText: { fontSize: 9, fontFamily: font.bold },
    change: { color: c.primary, fontSize: 10, fontFamily: font.bold },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, height: 42, marginBottom: 10 },
    searchInput: { flex: 1, color: c.text, fontSize: 12, fontFamily: font.regular, paddingVertical: 0 },
    personChip: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 150 },
    personName: { color: c.text, fontSize: 11, fontFamily: font.bold },
    personMeta: { color: c.sub, fontSize: 9, fontFamily: font.regular, marginTop: 2 },
    itemsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 },
    section: { color: c.text, fontSize: 12, fontFamily: font.extra },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    addBtnText: { color: c.primary, fontSize: 10, fontFamily: font.bold },
    empty: { alignItems: 'center', gap: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed', borderRadius: 18, paddingVertical: 26 },
    emptyText: { color: c.primary, fontSize: 12, fontFamily: font.bold },
    product: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 11, marginBottom: 8 },
    productName: { color: c.text, fontSize: 12, fontFamily: font.extra },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.cream, borderRadius: 12, padding: 3 },
    stepBtn: { width: 28, height: 28, borderRadius: 9, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    stepPlus: { backgroundColor: c.primary },
    stepSign: { color: c.primary, fontSize: 16, fontFamily: font.extra, lineHeight: 20 },
    qty: { minWidth: 34, textAlign: 'center', color: c.text, fontSize: 12, fontFamily: font.bold, paddingVertical: 0 },
    remove: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    footer: { backgroundColor: c.card, borderTopWidth: 1, borderColor: c.border, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12 },
    totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
    totalLabel: { color: c.sub, fontSize: 11, fontFamily: font.regular },
    totalValue: { color: c.text, fontSize: 20, fontFamily: font.extra },
    totalUnit: { fontSize: 11, fontFamily: font.semibold },
    actions: { flexDirection: 'row', gap: 8 },
    payBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    creditBtn: { backgroundColor: c.card, borderWidth: 1, borderColor: c.primary },
    cashBtn: { backgroundColor: c.primary },
    creditText: { color: c.primary, fontSize: 12, fontFamily: font.extra },
    cashText: { color: '#fff', fontSize: 12, fontFamily: font.extra },
    payDisabled: { opacity: 0.45 },
  });
}
