import { describe, it, expect } from 'vitest';
import { Invariance } from '../index.js';
import { HttpClient } from '../client.js';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubbed(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
  const http = (inv as unknown as { sessions: { http: HttpClient } }).sessions.http;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/v1/agent-sessions') {
      const b = body as { source: string; session_type?: string; title?: string };
      return {
        session: {
          id: 'sess_1',
          source: b.source,
          session_type: b.session_type ?? null,
          title: b.title ?? null,
          status: 'open',
        },
      };
    }
    if (method === 'POST' && path.endsWith('/events')) {
      return { appended: (body as { events: unknown[] }).events.length };
    }
    if (method === 'GET' && path.startsWith('/v1/agent-sessions/sess_')) {
      return { session: { id: 'sess_1', source: 'api' } };
    }
    if (method === 'GET' && path.startsWith('/v1/agent-sessions')) {
      return { data: [], next_cursor: null };
    }
    return {};
  };
  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  return { inv, calls };
}

describe('SessionsResource', () => {
  it('create() POSTs source + session_type + title and unwraps session', async () => {
    const { inv, calls } = stubbed();
    const s = await inv.sessions.create({
      source: 'api',
      session_type: 'note',
      title: 'standup',
    });
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v1/agent-sessions',
      body: { source: 'api', session_type: 'note', title: 'standup' },
    });
    expect(s.id).toBe('sess_1');
    expect(s.session_type).toBe('note');
  });

  it('list() forwards project_id, session_type, source, and pagination', async () => {
    const { inv, calls } = stubbed();
    await inv.sessions.list({
      project_id: 'p_1',
      session_type: 'meeting',
      source: 'granola_note',
      limit: 25,
    });
    expect(calls[0].method).toBe('GET');
    expect(calls[0].path).toBe(
      '/v1/agent-sessions?project_id=p_1&session_type=meeting&source=granola_note&limit=25',
    );
  });

  it('get() hits /v1/agent-sessions/:id', async () => {
    const { inv, calls } = stubbed();
    await inv.sessions.get('sess_1');
    expect(calls[0]).toEqual({
      method: 'GET',
      path: '/v1/agent-sessions/sess_1',
      body: undefined,
    });
  });

  it('appendEvents() POSTs to /:id/events with batched events', async () => {
    const { inv, calls } = stubbed();
    const res = await inv.sessions.appendEvents('sess_1', [
      { event_type: 'user_prompt', payload: { prompt: 'hi' } },
      { event_type: 'assistant_message', payload: { content: 'yo' } },
    ]);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/v1/agent-sessions/sess_1/events');
    expect((calls[0].body as { events: unknown[] }).events).toHaveLength(2);
    expect(res.appended).toBe(2);
  });

  it('fromClaudeCode() defaults source=claude_code and session_type=coding', async () => {
    const { inv, calls } = stubbed();
    await inv.sessions.fromClaudeCode({ title: 'pr-123' });
    expect(calls[0].body).toEqual({
      source: 'claude_code',
      session_type: 'coding',
      title: 'pr-123',
    });
  });

  it('fromMeetingNotes() defaults source=meeting and session_type=meeting', async () => {
    const { inv, calls } = stubbed();
    await inv.sessions.fromMeetingNotes({ title: 'design review' });
    expect((calls[0].body as { source: string }).source).toBe('meeting');
    expect((calls[0].body as { session_type: string }).session_type).toBe('meeting');
  });

  it('fromGranolaNote() defaults source=granola_note and session_type=note', async () => {
    const { inv, calls } = stubbed();
    await inv.sessions.fromGranolaNote({ external_session_id: 'gr_abc' });
    expect((calls[0].body as { source: string }).source).toBe('granola_note');
    expect((calls[0].body as { session_type: string }).session_type).toBe('note');
    expect((calls[0].body as { external_session_id: string }).external_session_id).toBe('gr_abc');
  });

  it('helper defaults can be overridden by the caller', async () => {
    const { inv, calls } = stubbed();
    await inv.sessions.fromGranolaNote({ source: 'manual_note', session_type: 'other' });
    expect((calls[0].body as { source: string }).source).toBe('manual_note');
    expect((calls[0].body as { session_type: string }).session_type).toBe('other');
  });
});
