import * as Crypto from 'expo-crypto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CartLine, CustomerPrice, Product, applySale, estimateCartTotal, isPositiveQuantity, lineTotal, stockShortages } from '../core/cart';
import { creditCheck, customerStatus, isLowStock } from '../core/dashboard';
import { format } from '../core/money';
import { OutboxItem } from '../core/outbox';
import { Receipt } from '../core/receipts';
import { receiptHtml } from '../core/receiptHtml';
import { Customer, local, saveOperation } from '../db/database';
import { pick, t } from '../i18n';
import { Btn, Empty, Icon, Pill, Stepper } from '../ui/kit';
import { ProductPicker } from './ProductPicker';
import { dir, labels, sharePdf } from './receiptShare';
import { useTheme } from './theme';

/** Sale in three steps: customer, items, confirm. The save is one atomic local write (operation + receipt + van stock). */
export function SaleScreen({ customerId, onSaved, onClose }: { customerId: string | null; onSaved: () => void; onClose: () => void }) {
  const { s, c } = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<CustomerPrice[]>([]);
  const [stock, setStock] = useState<Map<string, string>>(new Map());
  const [customer, setCustomer] = useState<string | null>(customerId);
  const [step, setStep] = useState<0 | 1 | 2>(customerId ? 1 : 0);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'CASH' | 'CREDIT'>('CASH');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState<Receipt | null>(null);
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
  const who = customers.find((x) => x.id === customer);
  const shownCustomers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.filter((x) => !needle || `${x.code} ${x.nameAr} ${x.nameEn ?? ''}`.toLowerCase().includes(needle));
  }, [customers, q]);
  const credit = kind === 'CREDIT' && who ? creditCheck(who.balance, who.creditLimit, total) : 'NO_LIMIT';

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
      await saveOperation(item, receipt, applySale(stock, byId, cart));
    } catch {
      saving.current = false;
      return Alert.alert(t('saveFailed'));
    }
    saving.current = false;
    setStock(applySale(stock, byId, cart));
    setDone(receipt);
    onSaved();
  }

  function reset() {
    setCart([]);
    setDone(null);
    setKind('CASH');
    setStep(customer ? 1 : 0);
  }

  if (done) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, alignItems: 'stretch', gap: 12 }}>
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={36} color={c.primary} />
          </View>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{t('saleSaved')}</Text>
          <Text style={{ color: c.sub, textAlign: 'center' }}>{t('savedOffline')}</Text>
          <Text style={{ color: c.text, fontSize: 32, fontWeight: '700' }}>{done.total}</Text>
        </View>
        <Btn label={t('share')} icon="receipt" kind="outline" onPress={() => void sharePdf(receiptHtml(done, labels(), dir()))} />
        <Btn label={t('newSale')} icon="plus" onPress={reset} />
        <Btn label={t('backToToday')} kind="ink" onPress={onClose} />
      </ScrollView>
    );
  }

  const stepper = (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      {([t('stepCustomer'), t('stepItems'), t('stepConfirm')] as const).map((label, i) => (
        <Pressable key={label} onPress={() => (i < step || (i === 1 && step === 0 && customer) ? setStep(i as 0 | 1 | 2) : undefined)} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= step ? c.primary : c.border }} />
          <Text style={{ color: i === step ? c.text : c.sub, fontSize: 12, fontWeight: i === step ? '700' : '400', marginTop: 4 }}>{i + 1}. {label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {stepper}

      {step === 0 ? (
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          <TextInput style={s.input} placeholder={t('search')} placeholderTextColor={c.sub} value={q} onChangeText={setQ} autoCorrect={false} accessibilityLabel={t('search')} />
          <Pressable onPress={() => { setCustomer(null); setStep(1); }} accessibilityRole="button" style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, marginBottom: 10 }}>
            <Icon name="cash" size={22} color={c.primary} />
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{t('noCustomer')}</Text>
          </Pressable>
          <FlatList
            data={shownCustomers}
            keyExtractor={(x) => x.id}
            initialNumToRender={15}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Empty icon="people" text={t('noData')} />}
            renderItem={({ item }) => {
              const st = customerStatus(item);
              return (
                <Pressable onPress={() => { setCustomer(item.id); setStep(1); }} accessibilityRole="button" style={{ backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: customer === item.id ? c.primary : c.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{pick(item.nameAr, item.nameEn)}</Text>
                    <Text style={{ color: c.sub, fontSize: 13 }}>{t('balance')} {item.balance} · {t('creditLimit')} {item.creditLimit}</Text>
                  </View>
                  {st !== 'CLEAR' ? <Pill tone={st === 'OVER_LIMIT' ? 'danger' : 'warn'} label={st === 'OVER_LIMIT' ? t('statusOver') : t('statusDue')} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: c.sub, fontSize: 13, marginBottom: 8 }}>{who ? pick(who.nameAr, who.nameEn) : t('noCustomer')} · {t('inCart')}: {cart.length} {t('itemsWord')}</Text>
            {cart.length === 0 ? <Empty icon="box" text={t('cartEmpty')} /> : null}
            {cart.map((l) => {
              const p = byId.get(l.productId);
              if (!p) return null;
              const qty = stock.get(p.id);
              return (
                <View key={l.productId} style={{ backgroundColor: c.card, borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{pick(p.nameAr, p.nameEn)}</Text>
                    <Text style={{ color: c.sub, fontSize: 12 }}>{t('van')}: {qty ?? '0'}{l.unitId ? ` · ${t('packUnit')} ${p.units.find((u) => u.unitId === l.unitId)?.factor ?? '?'}` : ''}</Text>
                    {isLowStock(qty) ? <Pill tone="warn" label={t('lowStock')} /> : null}
                  </View>
                  <Stepper
                    value={l.quantity}
                    onChange={(v) => setCart((cur) => cur.map((x) => (x.productId === l.productId ? { ...x, quantity: v } : x)))}
                    onRemove={() => setCart((cur) => cur.filter((x) => x.productId !== l.productId))}
                  />
                </View>
              );
            })}
            <Btn label={t('addMore')} icon="plus" kind="outline" onPress={() => setPicking(true)} />
          </ScrollView>
          <ProductPicker visible={picking} products={products} stock={stock} onPick={add} onClose={() => setPicking(false)} />
        </View>
      ) : null}

      {step === 2 ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 12 }}>
            <Text style={{ color: c.sub, fontSize: 13 }}>{t('stepCustomer')}</Text>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{who ? pick(who.nameAr, who.nameEn) : t('noCustomer')}</Text>
            {cart.map((l) => {
              const p = byId.get(l.productId);
              if (!p) return null;
              return (
                <View key={l.productId} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: c.text, flex: 1 }}>{pick(p.nameAr, p.nameEn)} × {l.quantity}</Text>
                  <Text style={{ color: c.text, fontWeight: '600' }}>{format(lineTotal(p, l, customer, prices, 'RETAIL'), 2)}</Text>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn flex={1} kind={kind === 'CASH' ? 'primary' : 'outline'} label={t('cash')} onPress={() => setKind('CASH')} />
            <Btn flex={1} kind={kind === 'CREDIT' ? 'primary' : 'outline'} label={t('credit')} onPress={() => setKind('CREDIT')} />
          </View>
          {credit === 'NEAR' || credit === 'OVER' ? (
            <View style={{ marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: credit === 'OVER' ? `${c.danger}1F` : `${c.warn}1F` }}>
              <Text style={{ color: credit === 'OVER' ? c.danger : c.warn, fontWeight: '700' }}>{credit === 'OVER' ? t('creditOver') : t('creditNear')}</Text>
            </View>
          ) : null}
          {kind === 'CREDIT' && !customer ? <Text style={s.error}>{t('selectCustomer')}</Text> : null}
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 12 }}>{t('estimate')}</Text>
        </ScrollView>
      ) : null}

      {step > 0 ? (
        <View style={{ backgroundColor: c.card, borderTopWidth: 1, borderColor: c.border, padding: 16, gap: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ color: c.sub }}>{t('total')}</Text>
            <Text style={{ color: c.text, fontSize: 24, fontWeight: '700' }}>{total}</Text>
          </View>
          {step === 1 ? (
            <Btn label={t('next')} onPress={() => setStep(2)} disabled={cart.length === 0} />
          ) : (
            <Btn label={kind === 'CASH' ? t('confirmCash') : t('confirmCredit')} onPress={() => void save()} disabled={cart.length === 0} />
          )}
        </View>
      ) : null}
    </View>
  );
}
