import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, SafeAreaView, Text, View } from 'react-native';
import { t } from '../i18n';
import { useTheme } from './theme';

/**
 * Full-screen barcode reader. The camera exists only while the modal is visible (so it is released when closed) and a
 * code repeated within 1.5 seconds is ignored, because the camera reports the same code many times per second.
 */
export function BarcodeScanner({ visible, onScan, onClose }: { visible: boolean; onScan: (code: string) => void; onClose: () => void }) {
  const { s, c } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    if (visible) {
      last.current = null;
      if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  function handle(code: string) {
    const now = Date.now();
    if (last.current && last.current.code === code && now - last.current.at < 1500) return;
    last.current = { code, at: now };
    onScan(code);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
            onBarcodeScanned={({ data }) => handle(data)}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 16 }}>{t('cameraPermission')}</Text>
            {permission?.canAskAgain ? (
              <Pressable style={s.button} onPress={() => void requestPermission()}>
                <Text style={s.buttonText}>{t('allowCamera')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        <Pressable
          style={[s.button, { margin: 16, backgroundColor: c.danger }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        >
          <Text style={s.buttonText}>{t('close')}</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}
