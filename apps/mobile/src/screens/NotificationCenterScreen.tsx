import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OutboxItem } from '../core/outbox';
import { displayMoney } from '../core/fieldDay';
import { Product } from '../core/cart';
import { Customer, local, store } from '../db/database';
import { t } from '../i18n';
import { useTheme } from './theme';

export function NotificationCenterScreen({ onOpenSync }: { onOpenSync: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState<OutboxItem[]>([]);
  const [lowStock, setLowStock] = useState<{ product: Product; qty: string }[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    (async () => {
      const outbox = await store.loadOutbox();
      setPending(outbox.filter((o) => o.status === 'PENDING').length);
      setRejected(outbox.filter((o) => o.status === 'REJECTED'));
      const [products, stock] = await Promise.all([local.products(), local.vanStock()]);
      const low = products
        .map((p) => ({ product: p, qty: stock.get(p.id) ?? '0' }))
        .filter((x) => Number(x.qty) > 0 && Number(x.qty) < 5)
        .slice(0, 8);
      setLowStock(low);
      setLastSync(await local.lastSync());
      setCustomers(await local.customers());
    })();
  }, []);

  const hour = new Date().getHours();
  const closeReminder = hour >= 17;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={st.content}>
      <Text style={st.title}>{t('notifications')}</Text>

      {pending > 0 ? (
        <Pressable style={st.card} onPress={onOpenSync} accessibilityRole="button">
          <View style={st.row}>
            <Ionicons name="cloud-upload-outline" size={20} color={c.amber} />
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>{t('pending')}</Text>
              <Text style={st.meta}>{pending} {t('pending')}</Text>
            </View>
            <Ionicons name="chevron-back" size={16} color={c.sub} />
          </View>
        </Pressable>
      ) : null}

      {rejected.length > 0 ? (
        <View style={st.card}>
          <View style={st.row}>
            <Ionicons name="alert-circle-outline" size={20} color={c.danger} />
            <Text style={st.cardTitle}>{t('rejected')} · {rejected.length}</Text>
          </View>
          {rejected.slice(0, 5).map((r) => (
            <Text key={r.opId} style={st.meta} numberOfLines={1}>· {r.type} — {r.error}</Text>
          ))}
        </View>
      ) : null}

      {lowStock.length > 0 ? (
        <View style={st.card}>
          <View style={st.row}>
            <Ionicons name="cube-outline" size={20} color={c.amber} />
            <Text style={st.cardTitle}>{t('vanStock')} — {t('available')}</Text>
          </View>
          {lowStock.map((x) => (
            <View key={x.product.id} style={st.row}>
              <Text style={st.meta} numberOfLines={1}>{x.product.nameAr}</Text>
              <Text style={st.money}>{x.qty}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {closeReminder ? (
        <View style={st.card}>
          <View style={st.row}>
            <Ionicons name="lock-closed-outline" size={20} color={c.amber} />
            <Text style={st.cardTitle}>{t('closeDay')}</Text>
          </View>
          <Text style={st.meta}>{t('closeDay')} — {t('needOnline')}</Text>
        </View>
      ) : null}

      <View style={st.card}>
        <View style={st.row}>
          <Ionicons name="time-outline" size={20} color={c.primary} />
          <Text style={st.cardTitle}>{t('lastSync')}</Text>
        </View>
        <Text style={st.meta}>{lastSync ?? t('never')}</Text>
      </View>

      {pending === 0 && rejected.length === 0 && lowStock.length === 0 && !closeReminder ? (
        <View style={st.empty}>
          <Ionicons name="checkmark-circle-outline" size={30} color={c.primary} />
          <Text style={st.meta}>{t('allSynced')}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
    title: { color: c.text, fontSize: 22, fontFamily: font.extra, letterSpacing: -0.4, marginBottom: 14 },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 14, marginBottom: 10 },
    cardTitle: { color: c.text, fontSize: 13, fontFamily: font.extra, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    meta: { color: c.sub, fontSize: 11, fontFamily: font.regular, marginTop: 2 },
    money: { color: c.text, fontSize: 12, fontFamily: font.bold },
    empty: { alignItems: 'center', gap: 8, paddingTop: 60 },
  });
}
