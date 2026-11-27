import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { OutboxItem } from '../core/outbox';
import { OpDisplayState, displayState } from '../core/opState';
import { discardRejected, local, store } from '../db/database';
import { t } from '../i18n';
import { SyncReport } from '../sync/syncEngine';
import { runSync } from '../sync/syncRunner';
import { useTheme } from './theme';

export function SyncScreen({ onSynced }: { onSynced: () => void }) {
  const { s, c } = useTheme();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);

  const refresh = useCallback(async () => {
    setItems(await store.loadOutbox());
    setLast(await local.lastSync());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run() {
    setBusy(true);
    try {
      setReport(await runSync());
      onSynced();
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  function discard(opId: string) {
    Alert.alert(t('discard'), t('confirmDiscard'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('discard'), style: 'destructive', onPress: () => void discardRejected(opId).then(refresh) },
    ]);
  }

  const stateLabel: Record<OpDisplayState, string> = {
    LOCAL_PENDING: t('stLocal'), SYNCING: t('stSyncing'), RETRY_PENDING: t('stRetry'), SERVER_REJECTED: t('stRejected'),
  };
  const typeLabel = (type: OutboxItem['type']) => t(`type${type}` as 'typeSALE' | 'typeRETURN' | 'typeCOLLECTION');

  const pending = items.filter((i) => i.status === 'PENDING');
  const rejected = items.filter((i) => i.status === 'REJECTED');
  return (
    <ScrollView style={s.screen}>
      <Text style={s.title}>{t('outbox')}</Text>
      <Text style={s.sub}>{t('lastSync')}: {last ?? t('never')}</Text>
      <Pressable style={s.button} onPress={run} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{t('sync')}</Text>}
      </Pressable>
      {report?.error ? <Text style={s.error}>{report.error}</Text> : null}

      <Text style={[s.text, { marginTop: 12 }]}>{t('pending')}: {pending.length}</Text>
      {pending.length === 0 ? <Text style={s.sub}>{t('nothingPending')}</Text> : null}
      {pending.map((i) => (
        <View key={i.opId} style={s.card}>
          <Text style={s.text}>{typeLabel(i.type)}</Text>
          <Text style={s.sub}>{stateLabel[displayState(i, busy)]} · {i.clientCreatedAt}</Text>
        </View>
      ))}

      <Text style={[s.text, { marginTop: 12 }]}>{t('rejected')}: {rejected.length}</Text>
      {rejected.map((i) => (
        <View key={i.opId} style={[s.card, { borderColor: c.danger }]}>
          <Text style={s.text}>{typeLabel(i.type)} · {stateLabel[displayState(i, busy)]}</Text>
          <Text style={s.error}>{t('reasonRejected')}: {i.error}</Text>
          <Pressable style={s.ghost} onPress={() => discard(i.opId)}>
            <Text style={{ color: c.danger }}>{t('discard')}</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
