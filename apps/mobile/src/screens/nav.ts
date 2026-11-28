export type Flow =
  | { name: 'sale'; customerId?: string | null }
  | { name: 'customer'; id: string }
  | { name: 'collection'; customerId?: string }
  | { name: 'return'; customerId?: string }
  | { name: 'expense' }
  | { name: 'newCustomer' }
  | { name: 'vanStock' }
  | { name: 'summary' }
  | { name: 'close' }
  | { name: 'sync' };

export interface Nav {
  open: (f: Flow) => void;
}
