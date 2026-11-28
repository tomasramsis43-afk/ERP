import { OutboxItem, displayStatus } from './outbox';

const item = (over: Partial<OutboxItem> = {}): OutboxItem => ({ opId: 'a', type: 'SALE', payload: {}, clientCreatedAt: '1', status: 'PENDING', error: null, attempts: 0, ...over });

describe('displayStatus', () => {
  it('maps queue state to what the representative sees', () => {
    expect(displayStatus(item(), false)).toBe('LOCAL_PENDING');
    expect(displayStatus(item(), true)).toBe('SYNCING');
    expect(displayStatus(item({ attempts: 2 }), false)).toBe('RETRY_PENDING');
    expect(displayStatus(item({ status: 'REJECTED', attempts: 1 }), true)).toBe('SERVER_REJECTED');
  });
});
