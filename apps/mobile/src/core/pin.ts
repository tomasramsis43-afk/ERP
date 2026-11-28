import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'erp.pin.hash';
const PIN_ENABLED = 'erp.pin.enabled';

/** Stores a 4-digit PIN as a SHA-256 hash in the OS keychain. */
export async function setPin(pin: string): Promise<void> {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
  await SecureStore.setItemAsync(PIN_KEY, hash);
  await SecureStore.setItemAsync(PIN_ENABLED, '1');
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_ENABLED)) === '1';
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored) return false;
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
  return hash === stored;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
  await SecureStore.deleteItemAsync(PIN_ENABLED);
}
