import type { RunClient } from './runs.js';

/**
 * Wrap a function so each call emits a Step in ``run``.
 *
 *   const lookup = trace(run, 'lookup', async (id: string) => db.fetch(id));
 *   const order = await lookup('o_123');
 *
 * Nested calls within the wrapped function auto-link via ``parent_id``
 * thanks to Step's AsyncLocalStorage-based context propagation.
 */
export function trace<Args extends readonly unknown[], R>(
  run: RunClient,
  action_type: string,
  fn: (...args: Args) => Promise<R>,
  opts: { captureArgs?: boolean; captureReturn?: boolean } = {},
): (...args: Args) => Promise<R> {
  const captureArgs = opts.captureArgs ?? true;
  const captureReturn = opts.captureReturn ?? true;

  return async (...args: Args): Promise<R> =>
    run.step(action_type, { input: captureArgs ? args : undefined }, async (step) => {
      const result = await fn(...args);
      if (captureReturn) step.output = result;
      return result;
    });
}
