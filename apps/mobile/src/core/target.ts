import * as SecureStore from 'expo-secure-store';

const key = (month: string) => `erp.target.${month}`;

export async function getMonthlyTarget(month: string): Promise<string | null> {
  return SecureStore.getItemAsync(key(month));
}

export async function setMonthlyTarget(month: string, amount: string): Promise<void> {
  await SecureStore.setItemAsync(key(month), amount);
}

export async function clearMonthlyTarget(month: string): Promise<void> {
  await SecureStore.deleteItemAsync(key(month));
}
