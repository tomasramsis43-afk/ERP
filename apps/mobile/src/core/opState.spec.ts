import { OutboxItem } from './outbox';
import { displayState } from './opState';

const i = (over: Partial<OutboxItem>): OutboxItem => ({ opId: 'a', type: 'SALE', payload: {}, clientCreatedAt: '1', status: 'PENDING', error: null, attempts: 0, ...over });

describe('displayState', () => {
  it('maps every queue state to what the rep should see', () => {
    expect(displayState(i({}), false)).toBe('LOCAL_PENDING');
    expect(displayState(i({}), true)).toBe('SYNCING');
    expect(displayState(i({ attempts: 2 }), false)).toBe('RETRY_PENDING');
    expect(displayState(i({ status: 'REJECTED', error: 'x' }), true)).toBe('SERVER_REJECTED');
  });
});
