import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { getServerUrl, login, setServerUrl } from '../api/client';
import { t } from '../i18n';
import { useTheme } from './theme';

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const { s, c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getServerUrl().then(setServer);
  }, []);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await setServerUrl(server);
      await login(email.trim(), password);
      onDone();
    } catch (e) {
      setError(`${t('loginFailed')}: ${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[s.screen, { justifyContent: 'center' }]}>
      <Text style={s.title}>{t('appName')}</Text>
      <TextInput style={s.input} placeholder={t('server')} placeholderTextColor={c.sub} autoCapitalize="none" autoCorrect={false} keyboardType="url" value={server} onChangeText={setServer} />
      <TextInput style={s.input} placeholder={t('email')} placeholderTextColor={c.sub} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder={t('password')} placeholderTextColor={c.sub} secureTextEntry value={password} onChangeText={setPassword} />
      {busy ? <Text style={{ color: c.sub, textAlign: 'center', marginBottom: 8 }}>{t('waking')}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable style={s.button} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{t('login')}</Text>}
      </Pressable>
    </View>
  );
}
