/**
 * Anthropic client wrapping. Emits an llm_call node on `run` per
 * `messages.create` call with token/cost metadata.
 */

import type { RunClient } from '../resources/runs.js';
import { priceCall } from './pricing.js';

interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

function extractUsage(resp: unknown): Usage {
  const u = (resp as { usage?: Record<string, unknown> } | undefined)?.usage;
  if (!u) return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
  return {
    inputTokens: n(u.input_tokens),
    outputTokens: n(u.output_tokens),
    cacheReadTokens: n(u.cache_read_input_tokens),
    cacheWriteTokens: n(u.cache_creation_input_tokens),
  };
}

export function instrumentAnthropic<T extends { messages: { create: (...args: unknown[]) => Promise<unknown> } }>(
  client: T,
  run: RunClient,
): T {
  const originalCreate = client.messages.create.bind(client.messages);

  const wrappedCreate = async (...args: unknown[]): Promise<unknown> => {
    const params = (args[0] ?? {}) as { model?: string };
    const model = params.model ?? 'unknown';
    const start = Date.now();
    let resp: unknown;
    let error: unknown;
    try {
      resp = await originalCreate(...args);
      return resp;
    } catch (e) {
      error = e;
      throw e;
    } finally {
      const latencyMs = Date.now() - start;
      const usage = error ? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } : extractUsage(resp);
      const cost = priceCall({ model, ...usage });
      await run.step(
        'llm_call',
        {
          type: 'llm_call',
          metadata: {
            llm: {
              provider: 'anthropic',
              model,
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              cache_read_tokens: usage.cacheReadTokens,
              cache_write_tokens: usage.cacheWriteTokens,
              cost_usd: cost,
              latency_ms: latencyMs,
              status: error ? 'error' : 'success',
            },
          },
        },
        async (s) => {
          if (error) s.error = error instanceof Error ? { message: error.message, type: error.name } : error;
        },
      );
    }
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'messages') {
        return new Proxy(target.messages, {
          get(msgTarget, msgProp) {
            if (msgProp === 'create') return wrappedCreate;
            return Reflect.get(msgTarget, msgProp);
          },
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
