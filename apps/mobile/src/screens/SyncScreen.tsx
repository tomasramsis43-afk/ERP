import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { syncApi } from '../api/client';
import { DisplayStatus, OutboxItem, displayStatus } from '../core/outbox';
import { discardOperation, getDeviceId, local, store } from '../db/database';
import { t } from '../i18n';
import { SyncReport, synchronize } from '../sync/syncEngine';
import { useTheme } from './theme';

const STATUS_KEY: Record<DisplayStatus, 'statusLocalPending' | 'statusSyncing' | 'statusRetry' | 'rejected'> = {
  LOCAL_PENDING: 'statusLocalPending',
  SYNCING: 'statusSyncing',
  RETRY_PENDING: 'statusRetry',
  SERVER_REJECTED: 'rejected',
};

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
      setReport(await synchronize(syncApi, store, await getDeviceId()));
      onSynced();
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function discard(opId: string) {
    await discardOperation(opId);
    await refresh();
  }

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
      {report && report.applied > 0 ? <Text style={s.sub}>{t('acceptedByServer')}: {report.applied}</Text> : null}

      <Text style={[s.text, { marginTop: 12 }]}>{t('pending')}: {pending.length}</Text>
      {pending.length === 0 ? <Text style={s.sub}>{t('nothingPending')}</Text> : null}
      {pending.map((i) => (
        <View key={i.opId} style={s.card}>
          <Text style={s.text}>{i.type} · {t(STATUS_KEY[displayStatus(i, busy)])}</Text>
          <Text style={s.sub}>{i.clientCreatedAt}{i.attempts > 0 ? ` · ${t('attempts')}: ${i.attempts}` : ''}</Text>
        </View>
      ))}

      <Text style={[s.text, { marginTop: 12 }]}>{t('rejected')}: {rejected.length}</Text>
      {rejected.map((i) => (
        <View key={i.opId} style={[s.card, { borderColor: c.danger }]}>
          <Text style={s.text}>{i.type}</Text>
          <Text style={s.error}>{t('reasonRejected')}: {i.error}</Text>
          <Pressable style={s.ghost} onPress={() => discard(i.opId)}>
            <Text style={{ color: c.danger }}>{t('discard')}</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
