/**
 * Session-recorder hooks for the Anthropic and OpenAI SDKs. Wraps an
 * existing client so every model call emits normalized events into the
 * Invariance agent_sessions / agent_events tables — same destination as
 * the Claude Code / Codex CLI hooks, no platform-side changes needed.
 *
 * Distinct from `providers/{anthropic,openai}.ts` which emit structured
 * llm_call nodes into a RunClient. This module is for agents that don't
 * use the SDK's run DAG but still want their tool-using sessions captured.
 *
 * Example:
 *   import Anthropic from '@anthropic-ai/sdk';
 *   import { createRecordedSession, recordAnthropic } from '@invariance/sdk/record';
 *
 *   const session = await createRecordedSession({
 *     source: 'anthropic_sdk',
 *     apiKey: process.env.INVARIANCE_API_KEY!,
 *     model: 'claude-opus-4-7',
 *   });
 *   const anthropic = recordAnthropic(new Anthropic(), session);
 *   const resp = await anthropic.messages.create({ ... });
 *   await session.end('done');
 */

const DEFAULT_BASE_URL = 'https://api.useinvariance.com';
const FETCH_TIMEOUT_MS = 5000;
const BATCH_FLUSH_MS = 500;

export type RecordSource =
  | 'anthropic_sdk'
  | 'openai_sdk'
  | 'invariance_cli'
  | 'mcp'
  | 'other';

export type RecordEventType =
  | 'session_start'
  | 'session_end'
  | 'user_prompt'
  | 'assistant_message'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'error'
  | 'custom';

export interface RecordedSessionOptions {
  source: RecordSource;
  /** Provide a stable external id (e.g. trace id) or one will be generated. */
  externalSessionId?: string;
  /** API key. Falls back to INVARIANCE_API_KEY env var. */
  apiKey?: string;
  /** Platform base URL. Falls back to INVARIANCE_API_URL env var. */
  baseUrl?: string;
  model?: string;
  cwd?: string;
  /** Suppress recording errors (default true — never break the caller). */
  silent?: boolean;
}

export interface RecordEventInput {
  event_type: RecordEventType;
  payload?: Record<string, unknown>;
  raw?: Record<string, unknown>;
  tool_use_id?: string;
}

export class RecordedSession {
  readonly id: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly silent: boolean;
  private seq = 0;
  private pending: Array<RecordEventInput & { seq: number; ts: string }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight: Promise<void> | null = null;

  constructor(id: string, apiKey: string, baseUrl: string, silent: boolean) {
    this.id = id;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.silent = silent;
  }

  emit(event: RecordEventInput): void {
    this.pending.push({ ...event, seq: this.seq++, ts: new Date().toISOString() });
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, BATCH_FLUSH_MS);
  }

  async flush(): Promise<void> {
    if (this.flushInFlight) {
      await this.flushInFlight;
    }
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0, 100);
    this.flushInFlight = (async () => {
      try {
        await this.post(`/v1/agent-sessions/${this.id}/events`, { events: batch });
      } catch (err) {
        if (!this.silent) console.error('[invariance/record] flush failed:', err);
        // Put events back at the front so they retry on next flush.
        this.pending.unshift(...batch);
      } finally {
        this.flushInFlight = null;
      }
    })();
    await this.flushInFlight;
    if (this.pending.length > 0) await this.flush();
  }

  async end(reason: string = 'done'): Promise<void> {
    this.emit({ event_type: 'session_end', payload: { reason } });
    await this.flush();
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': '@invariance/sdk/record',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function createRecordedSession(
  opts: RecordedSessionOptions,
): Promise<RecordedSession> {
  const apiKey = opts.apiKey ?? process.env.INVARIANCE_API_KEY;
  if (!apiKey) {
    throw new Error('INVARIANCE_API_KEY not set and no apiKey provided');
  }
  const baseUrl = (opts.baseUrl ?? process.env.INVARIANCE_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const silent = opts.silent ?? true;
  const externalId = opts.externalSessionId ?? `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Resolve canonical session id. Idempotent upsert on (project, source, ext).
  const res = (await postRaw(baseUrl, apiKey, '/v1/agent-sessions', {
    source: opts.source,
    external_session_id: externalId,
    model: opts.model,
    cwd: opts.cwd,
    client_version: '@invariance/sdk/record/0.1',
  })) as { session: { id: string } };

  const session = new RecordedSession(res.session.id, apiKey, baseUrl, silent);
  session.emit({
    event_type: 'session_start',
    payload: { source: opts.source, model: opts.model },
  });
  return session;
}

async function postRaw(baseUrl: string, apiKey: string, path: string, body: unknown): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': '@invariance/sdk/record',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : undefined;
  } finally {
    clearTimeout(timer);
  }
}

// ── Anthropic wrapper ──────────────────────────────────────────────────────

interface AnthropicMessagesClient {
  messages: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
}

/**
 * Wraps an Anthropic SDK client so every `messages.create` call emits a
 * `user_prompt` (the final user turn) + `assistant_message` event, plus
 * `tool_call_start` for every tool_use block in the response. The client is
 * returned mutated in place — same reference, no copy.
 */
export function recordAnthropic<T extends AnthropicMessagesClient>(
  client: T,
  session: RecordedSession,
): T {
  const original = client.messages.create.bind(client.messages);
  client.messages.create = async (...args: unknown[]): Promise<unknown> => {
    const params = (args[0] ?? {}) as {
      model?: string;
      messages?: Array<{ role: string; content: unknown }>;
      system?: unknown;
    };
    // Emit the last user turn as a user_prompt. (We don't dump entire history
    // every call — that would balloon storage; the timeline reconstructs
    // history from sequential events.)
    const lastUser = findLast(params.messages, (m) => m.role === 'user');
    if (lastUser) {
      session.emit({
        event_type: 'user_prompt',
        payload: { prompt: anthropicTextOf(lastUser.content), model: params.model },
      });
    }
    let resp: unknown;
    try {
      resp = await original(...args);
    } catch (err) {
      session.emit({
        event_type: 'error',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
    const respObj = resp as {
      content?: Array<Record<string, unknown>>;
      stop_reason?: string;
      usage?: Record<string, unknown>;
    };
    const text = anthropicAssistantText(respObj.content);
    session.emit({
      event_type: 'assistant_message',
      payload: {
        content: text,
        stop_reason: respObj.stop_reason,
        usage: respObj.usage,
      },
    });
    for (const block of respObj.content ?? []) {
      if (block.type === 'tool_use') {
        session.emit({
          event_type: 'tool_call_start',
          tool_use_id: typeof block.id === 'string' ? block.id : undefined,
          payload: { tool_name: block.name, input: block.input },
        });
      }
    }
    // tool_result blocks in the *next* user turn close the loop.
    if (lastUser && Array.isArray(lastUser.content)) {
      for (const block of lastUser.content as Array<Record<string, unknown>>) {
        if (block.type === 'tool_result') {
          session.emit({
            event_type: 'tool_call_end',
            tool_use_id: typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined,
            payload: { output: block.content, error: block.is_error },
          });
        }
      }
    }
    return resp;
  };
  return client;
}

function anthropicTextOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const b of content) {
      if (b && typeof b === 'object' && (b as { type?: string }).type === 'text') {
        parts.push(String((b as { text?: unknown }).text ?? ''));
      }
    }
    return parts.join('\n');
  }
  return '';
}

function anthropicAssistantText(content: Array<Record<string, unknown>> | undefined): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b.type === 'text')
    .map((b) => String(b.text ?? ''))
    .join('\n');
}

// ── OpenAI wrapper ─────────────────────────────────────────────────────────

interface OpenAIChatClient {
  chat: {
    completions: {
      create: (...args: unknown[]) => Promise<unknown>;
    };
  };
}

/**
 * Wraps an OpenAI SDK client so every `chat.completions.create` call emits
 * a `user_prompt` + `assistant_message` event, plus `tool_call_start` for
 * any tool_calls in the response. Tool results sent back in subsequent
 * calls (role='tool' messages) emit `tool_call_end`.
 */
export function recordOpenAI<T extends OpenAIChatClient>(
  client: T,
  session: RecordedSession,
): T {
  const original = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = async (...args: unknown[]): Promise<unknown> => {
    const params = (args[0] ?? {}) as {
      model?: string;
      messages?: Array<{ role: string; content?: unknown; tool_call_id?: string }>;
    };
    const messages = params.messages ?? [];

    // Emit tool_call_end for any tool messages in this turn's input.
    for (const m of messages) {
      if (m.role === 'tool' && m.tool_call_id) {
        session.emit({
          event_type: 'tool_call_end',
          tool_use_id: m.tool_call_id,
          payload: { output: m.content },
        });
      }
    }
    const lastUser = findLast(messages, (m) => m.role === 'user');
    if (lastUser) {
      session.emit({
        event_type: 'user_prompt',
        payload: { prompt: openaiTextOf(lastUser.content), model: params.model },
      });
    }
    let resp: unknown;
    try {
      resp = await original(...args);
    } catch (err) {
      session.emit({
        event_type: 'error',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
    const choice = ((resp as { choices?: Array<{ message?: Record<string, unknown> }> }).choices ?? [])[0];
    const msg = (choice?.message ?? {}) as {
      content?: unknown;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
    session.emit({
      event_type: 'assistant_message',
      payload: {
        content: typeof msg.content === 'string' ? msg.content : '',
        usage: (resp as { usage?: unknown }).usage,
      },
    });
    for (const tc of msg.tool_calls ?? []) {
      let input: unknown = tc.function?.arguments;
      if (typeof input === 'string') {
        try {
          input = JSON.parse(input);
        } catch {
          /* keep raw string */
        }
      }
      session.emit({
        event_type: 'tool_call_start',
        tool_use_id: tc.id,
        payload: { tool_name: tc.function?.name, input },
      });
    }
    return resp;
  };
  return client;
}

function findLast<T>(arr: T[] | undefined, pred: (t: T) => boolean): T | undefined {
  if (!arr) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return arr[i];
  }
  return undefined;
}

function openaiTextOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const b of content) {
      if (b && typeof b === 'object' && (b as { type?: string }).type === 'text') {
        parts.push(String((b as { text?: unknown }).text ?? ''));
      }
    }
    return parts.join('\n');
  }
  return '';
}
