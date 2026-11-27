/** Minimal key-value storage the device identity needs; SecureStore in the app, memory in tests. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const KEY = 'erp.deviceId';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns this installation's identity. It is created once from a random UUID, persisted, and reused on every
 * start. It labels audit logs and sync metadata only; it is never an authentication factor.
 * A stored value that is not a valid UUID (corrupted) is replaced rather than trusted.
 */
export async function ensureDeviceId(storage: KeyValueStore, newUuid: () => string): Promise<string> {
  const existing = await storage.get(KEY);
  if (existing && UUID.test(existing)) return existing;
  const created = newUuid();
  await storage.set(KEY, created);
  return created;
}
