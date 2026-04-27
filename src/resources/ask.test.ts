import { describe, it, expect } from 'vitest';
import { Invariance } from '../index.js';
import { HttpClient } from '../client.js';

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function stubbed(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
  const http = (inv as unknown as { ask: { http: HttpClient } }).ask.http;

  (http as unknown as { post: unknown }).post = async (p: string, b?: unknown) => {
    calls.push({ method: 'POST', path: p, body: b });
    return {
      session: { id: 'kbs_1', agent_id: 'a', project_id: 'p', title: 't', model: null,
        created_at: '', updated_at: '' },
      messages: [],
      final_text: 'hello',
      turns: 1,
    };
  };
  return { inv, calls };
}

describe('AskResource.send', () => {
  it('posts /v1/ask with the request body and returns AskResponse', async () => {
    const { inv, calls } = stubbed();
    const out = await inv.ask.send({ message: 'hi', max_turns: 4 });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/v1/ask',
      body: { message: 'hi', max_turns: 4 },
    });
    expect(out.final_text).toBe('hello');
    expect(out.turns).toBe(1);
  });

  it('passes session_id when resuming', async () => {
    const { inv, calls } = stubbed();
    await inv.ask.send({ message: 'follow up', session_id: 'kbs_1' });
    expect((calls[0].body as { session_id: string }).session_id).toBe('kbs_1');
  });
});
