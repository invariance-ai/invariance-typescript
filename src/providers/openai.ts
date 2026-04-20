/**
 * OpenAI (or OpenAI-compatible) client wrapping.
 *
 * Usage:
 *   const oa = instrumentOpenAI(new OpenAI(), run);
 *   const resp = await oa.chat.completions.create({ model, messages });
 *   // response is returned as-is; an llm_call node is emitted on `run` with
 *   // metadata.llm = { provider, model, tokens, cost_usd, latency_ms }.
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
  const details = (u.prompt_tokens_details as Record<string, unknown> | undefined) ?? undefined;
  return {
    inputTokens: n(u.prompt_tokens ?? u.input_tokens),
    outputTokens: n(u.completion_tokens ?? u.output_tokens),
    cacheReadTokens: n(details?.cached_tokens),
    cacheWriteTokens: 0,
  };
}

export interface InstrumentOpenAIOptions {
  /** Label calls distinctly — e.g. 'azure-openai', 'together', 'groq'. */
  provider?: string;
}

export function instrumentOpenAI<T extends { chat: { completions: { create: (...args: unknown[]) => Promise<unknown> } } }>(
  client: T,
  run: RunClient,
  opts: InstrumentOpenAIOptions = {},
): T {
  const provider = opts.provider ?? 'openai';
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

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
              provider,
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

  // Return a shallow clone so we don't mutate the caller's client.
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'chat') {
        return new Proxy(target.chat, {
          get(chatTarget, chatProp) {
            if (chatProp === 'completions') {
              return new Proxy(chatTarget.completions, {
                get(compTarget, compProp) {
                  if (compProp === 'create') return wrappedCreate;
                  return Reflect.get(compTarget, compProp);
                },
              });
            }
            return Reflect.get(chatTarget, chatProp);
          },
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
