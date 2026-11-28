import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, Pressable, View } from 'react-native';
import { get, post } from '../api/client';
import { Product } from '../core/cart';
import { NetworkError } from '../core/http';
import { local, RepProfile, store } from '../db/database';
import { pick, t } from '../i18n';
import { useTheme } from './theme';

interface Preview {
  date: string;
  salesCash: string;
  salesCredit: string;
  collections: string;
  expectedCash: string;
  lines: { productId: string; expectedQty: string }[];
}

const NUM = /^\d{1,14}(\.\d{1,4})?$/;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * End-of-day closing. It is deliberately online-only and blocked while anything is still in the outbox:
 * the server computes the expected cash and van stock from what it has received, so unsent sales or
 * collections would show up as false shortages.
 */
export function CloseDayScreen({ version, onClosed }: { version: number; onClosed: () => void }) {
  const { s, c } = useTheme();
  const [rep, setRep] = useState<RepProfile | null>(null);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [unsent, setUnsent] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [declared, setDeclared] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closing = useRef(false);

  const load = useCallback(async () => {
    setRep(await local.rep());
    setProducts(new Map((await local.products()).map((p) => [p.id, p])));
    setUnsent((await store.loadOutbox()).length);
  }, []);
  useEffect(() => {
    void load();
  }, [load, version]);

  async function loadPreview() {
    if (!rep) return;
    setBusy(true); setError(null);
    try {
      const p = await get<Preview>(`/representatives/${rep.id}/closing-preview?date=${today()}`);
      setPreview(p); setDeclared(''); setCounts({}); setReason('');
    } catch (e) {
      setPreview(null);
      setError(e instanceof NetworkError ? t('needOnline') : (e as Error).message);
    } finally { setBusy(false); }
  }

  const lines = preview?.lines ?? [];
  const cashDiff = preview && NUM.test(declared) ? Number(declared) - Number(preview.expectedCash) : null;
  const allCounted = lines.every((l) => NUM.test(counts[l.productId] ?? ''));
  const stockDiff = lines.filter((l) => NUM.test(counts[l.productId] ?? '') && Number(counts[l.productId]) !== Number(l.expectedQty)).length;
  const hasDiff = Boolean(cashDiff) || stockDiff > 0;
  const ready = Boolean(preview) && NUM.test(declared) && allCounted && (!hasDiff || reason.trim().length >= 3);
  const name = useMemo(() => (id: string) => { const p = products.get(id); return p ? pick(p.nameAr, p.nameEn) : id; }, [products]);

  async function close() {
    if (closing.current) return;
    if (!rep || !preview || !ready) return Alert.alert(t('closeDay'), t('fillAll'));
    closing.current = true;
    setBusy(true); setError(null);
    try {
      await post(`/representatives/${rep.id}/close-day`, {
        date: preview.date,
        declaredCash: declared,
        counts: lines.map((l) => ({ productId: l.productId, quantity: counts[l.productId] })),
        ...(hasDiff ? { differenceReason: reason.trim() } : {}),
      });
      Alert.alert(t('dayClosed'));
      setPreview(null);
      onClosed();
    } catch (e) {
      setError(e instanceof NetworkError ? t('needOnline') : (e as Error).message);
    } finally { closing.current = false; setBusy(false); }
  }

  return (
    <ScrollView style={s.screen} keyboardShouldPersistTaps="handled">
      {unsent > 0 ? <Text style={s.error}>{t('syncFirst')} ({unsent})</Text> : null}
      <Pressable style={[s.button, unsent > 0 || !rep ? { opacity: 0.4 } : null]} disabled={unsent > 0 || !rep || busy} onPress={loadPreview}>
        <Text style={s.buttonText}>{t('preview')}</Text>
      </Pressable>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {preview ? (
        <View>
          <View style={s.card}>
            <Text style={s.text}>{t('expectedCash')}: {preview.expectedCash}</Text>
            <Text style={s.sub}>{t('cashSales')}: {preview.salesCash}</Text>
            <Text style={s.sub}>{t('creditSales')}: {preview.salesCredit}</Text>
            <Text style={s.sub}>{t('collections')}: {preview.collections}</Text>
          </View>
          <TextInput style={s.input} placeholder={t('declaredCash')} placeholderTextColor={c.sub} keyboardType="decimal-pad" value={declared} onChangeText={setDeclared} />
          {cashDiff !== null ? <Text style={cashDiff === 0 ? s.sub : s.error}>{t('difference')}: {cashDiff.toFixed(2)}</Text> : null}
          {lines.map((l) => {
            const v = counts[l.productId] ?? '';
            const diff = NUM.test(v) ? Number(v) - Number(l.expectedQty) : null;
            return (
              <View key={l.productId} style={s.card}>
                <Text style={s.text}>{name(l.productId)}</Text>
                <Text style={s.sub}>{t('expected')}: {l.expectedQty}</Text>
                <TextInput style={s.input} placeholder={t('counted')} placeholderTextColor={c.sub} keyboardType="decimal-pad" value={v} onChangeText={(x) => setCounts({ ...counts, [l.productId]: x })} />
                {diff !== null ? <Text style={diff === 0 ? s.sub : s.error}>{t('difference')}: {diff}</Text> : null}
              </View>
            );
          })}
          {hasDiff ? <TextInput style={s.input} placeholder={t('differenceReason')} placeholderTextColor={c.sub} multiline value={reason} onChangeText={setReason} /> : null}
          <Pressable style={[s.button, !ready || busy ? { opacity: 0.4 } : null]} disabled={!ready || busy} onPress={close}>
            <Text style={s.buttonText}>{t('closeTheDay')}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}
