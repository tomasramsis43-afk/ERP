import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { t } from '../i18n';
import { useTheme } from './theme';

const KEY = (id: string) => `erp.photo.${id}`;

export async function getCustomerPhoto(customerId: string): Promise<string | null> {
  return SecureStore.getItemAsync(KEY(customerId));
}

export async function setCustomerPhoto(customerId: string, uri: string): Promise<void> {
  await SecureStore.setItemAsync(KEY(customerId), uri);
}

export async function clearCustomerPhoto(customerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(KEY(customerId));
}

export function PhotoCaptureScreen({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const { c, font } = useTheme();
  const st = React.useMemo(() => makeStyles(c, font), [c, font]);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [busy, setBusy] = useState(false);

  async function capture() {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (!pic?.uri) { setBusy(false); return; }
      const dest = `${FileSystem.documentDirectory}cust_${customerId}.jpg`;
      await FileSystem.copyAsync({ from: pic.uri, to: dest });
      await setCustomerPhoto(customerId, dest);
      Alert.alert(t('notesSaved'));
      onDone();
    } catch {
      Alert.alert(t('opFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!permission) return <View style={st.root} />;
  if (!permission.granted) {
    return (
      <View style={st.root}>
        <Text style={st.title}>{t('cameraPermission')}</Text>
        <Pressable style={st.button} onPress={requestPermission} accessibilityRole="button">
          <Text style={st.buttonText}>{t('allowCamera')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={st.root}>
      <CameraView ref={cameraRef} style={st.camera} facing="back" />
      <View style={st.bar}>
        <Pressable style={st.captureBtn} onPress={capture} disabled={busy} accessibilityRole="button">
          <Ionicons name="camera" size={28} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['c'], font: ReturnType<typeof useTheme>['font']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
    title: { color: c.text, fontSize: 16, fontFamily: font.extra, marginBottom: 16, textAlign: 'center' },
    button: { backgroundColor: c.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 12 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: font.bold },
    camera: { flex: 1, width: '100%' },
    bar: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center' },
    captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff' },
  });
}
