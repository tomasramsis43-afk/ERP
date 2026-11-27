/**
 * Runs async tasks strictly one after another. SQLite writes that must not interleave (each is a multi-statement
 * transaction on one shared connection) go through one queue. A failing task rejects only its own caller.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
