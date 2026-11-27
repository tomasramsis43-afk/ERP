import { createSerialQueue } from './serial';

describe('createSerialQueue', () => {
  it('never runs two tasks at the same time and keeps submission order', async () => {
    const q = createSerialQueue();
    const log: string[] = [];
    let running = 0;
    const task = (name: string, ms: number) => q(async () => {
      running += 1;
      expect(running).toBe(1);
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      running -= 1;
    });
    await Promise.all([task('a', 20), task('b', 1), task('c', 5)]);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('a failing task rejects only its own caller; later tasks still run', async () => {
    const q = createSerialQueue();
    const failing = q(async () => { throw new Error('boom'); });
    const after = q(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
  });
});
