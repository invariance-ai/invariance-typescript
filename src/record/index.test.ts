import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordedSession, recordAnthropic, recordOpenAI } from './index.js';

// Light unit tests: assert event normalization without hitting the real API.
// Integration tests against a live Supabase live in apps/api/src/test/.

function fakeSession(): { session: RecordedSession; emitted: Array<Record<string, unknown>> } {
  const emitted: Array<Record<string, unknown>> = [];
  const session = new RecordedSession('asess_test', 'inv_test_x', 'http://localhost', true);
  // Capture instead of POSTing.
  (session as unknown as { emit: (e: Record<string, unknown>) => void }).emit = (e) => {
    emitted.push(e);
  };
  return { session, emitted };
}

describe('recordAnthropic', () => {
  let session: RecordedSession;
  let emitted: Array<Record<string, unknown>>;

  beforeEach(() => {
    ({ session, emitted } = fakeSession());
  });

  it('emits user_prompt + assistant_message + tool_call_start', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'Sure, calling tool.' },
        { type: 'tool_use', id: 'tu_1', name: 'Bash', input: { cmd: 'ls' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const client = { messages: { create } };
    const wrapped = recordAnthropic(client, session);
    await wrapped.messages.create({
      model: 'claude-opus-4-7',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(emitted.map((e) => e.event_type)).toEqual([
      'user_prompt',
      'assistant_message',
      'tool_call_start',
    ]);
    expect(emitted[2].tool_use_id).toBe('tu_1');
    expect((emitted[2].payload as { tool_name: string }).tool_name).toBe('Bash');
  });

  it('emits tool_call_end when next turn carries a tool_result', async () => {
    const create = vi.fn().mockResolvedValue({ content: [], stop_reason: 'end_turn' });
    const wrapped = recordAnthropic({ messages: { create } }, session);
    await wrapped.messages.create({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu_1', content: 'a.txt\nb.txt', is_error: false },
          ],
        },
      ],
    });
    expect(emitted.find((e) => e.event_type === 'tool_call_end')).toBeTruthy();
    expect(emitted.find((e) => e.event_type === 'tool_call_end')!.tool_use_id).toBe('tu_1');
  });

  it('emits an error event when the API call throws', async () => {
    const create = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapped = recordAnthropic({ messages: { create } }, session);
    await expect(
      wrapped.messages.create({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('boom');
    expect(emitted.some((e) => e.event_type === 'error')).toBe(true);
  });
});

describe('recordOpenAI', () => {
  it('emits user_prompt + assistant_message + tool_call_start from chat.completions', async () => {
    const { session, emitted } = fakeSession();
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              { id: 'call_1', function: { name: 'lookup', arguments: '{"q":"x"}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 2 },
    });
    const client = { chat: { completions: { create } } };
    const wrapped = recordOpenAI(client, session);
    await wrapped.chat.completions.create({
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'do it' }],
    });
    const types = emitted.map((e) => e.event_type);
    expect(types).toContain('user_prompt');
    expect(types).toContain('assistant_message');
    expect(types).toContain('tool_call_start');
    const tcStart = emitted.find((e) => e.event_type === 'tool_call_start')!;
    expect(tcStart.tool_use_id).toBe('call_1');
    expect((tcStart.payload as { input: { q: string } }).input).toEqual({ q: 'x' });
  });

  it('emits tool_call_end when a role=tool message is carried back', async () => {
    const { session, emitted } = fakeSession();
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'done' } }],
    });
    const wrapped = recordOpenAI({ chat: { completions: { create } } }, session);
    await wrapped.chat.completions.create({
      messages: [
        { role: 'tool', tool_call_id: 'call_1', content: 'result' },
        { role: 'user', content: 'next' },
      ],
    });
    expect(emitted[0]).toMatchObject({ event_type: 'tool_call_end', tool_use_id: 'call_1' });
  });
});
