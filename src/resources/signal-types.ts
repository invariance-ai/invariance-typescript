import { buildSignalBody, type EmitSignalInput } from './signals.js';
import type { Severity } from './monitors.js';

export interface SignalTypeDefaults {
  severity: Severity;
  title: string;
  message?: string;
}

/**
 * Declare a reusable signal category. The returned helper stamps `type`
 * (and default severity/title/message) onto emit calls, narrowing `data`
 * to the declared generic.
 *
 *   const DangerousOutput = defineSignalType<{ reason: string }>(
 *     'dangerous_output',
 *     { severity: 'high', title: 'Dangerous output' },
 *   );
 *   await run.signal(DangerousOutput.signal({ data: { reason: 'keyword' } }));
 */
export interface SignalType<T> {
  readonly type: string;
  readonly defaults: SignalTypeDefaults;
  signal(
    input: { data: T } & Partial<Omit<EmitSignalInput, 'data' | 'type'>>,
  ): EmitSignalInput;
}

export function defineSignalType<T = unknown>(
  type: string,
  defaults: SignalTypeDefaults,
): SignalType<T> {
  return {
    type,
    defaults,
    signal(input) {
      const { data, ...rest } = input;
      return buildSignalBody({
        type,
        severity: rest.severity ?? defaults.severity,
        title: rest.title ?? defaults.title,
        message: rest.message ?? defaults.message,
        data,
        node_id: rest.node_id,
        run_id: rest.run_id,
      });
    },
  };
}
