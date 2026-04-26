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

  const pagesHttp = (inv as unknown as { kb: { pages: { http: HttpClient } } }).kb.pages.http;
  const sessionsHttp = (inv as unknown as { kb: { sessions: { http: HttpClient } } }).kb.sessions
    .http;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/v1/kb/pages')
      return { page: { id: 'kbp_1', ...(body as object) } };
    if (method === 'GET' && path.startsWith('/v1/kb/pages/'))
      return { page: { id: path.split('/').pop() } };
    if (method === 'GET' && path.startsWith('/v1/kb/pages'))
      return { data: [{ id: 'kbp_1' }], next_cursor: null };
    if (method === 'PATCH' && path.startsWith('/v1/kb/pages/'))
      return { page: { id: path.split('/').pop(), ...(body as object) } };
    if (method === 'DELETE') return undefined;
    if (method === 'POST' && path === '/v1/kb/sessions')
      return { session: { id: 'kbs_1', ...(body as object) } };
    if (method === 'GET' && path === '/v1/kb/sessions')
      return { data: [{ id: 'kbs_1' }], next_cursor: null };
    if (method === 'GET' && path.endsWith('/messages'))
      return { messages: [{ id: 'kbm_1' }] };
    if (method === 'GET' && path.startsWith('/v1/kb/sessions/'))
      return { session: { id: path.split('/').pop() } };
    if (method === 'POST' && path.endsWith('/messages'))
      return { message: { id: 'kbm_1', ...(body as object) } };
    return {};
  };

  for (const http of [pagesHttp, sessionsHttp]) {
    (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
    (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
    (http as unknown as { patch: unknown }).patch = (p: string, b?: unknown) =>
      record('PATCH', p, b);
    (http as unknown as { delete: unknown }).delete = (p: string) => record('DELETE', p);
  }
  return { inv, calls };
}

describe('KbResource.pages', () => {
  it('create posts to /v1/kb/pages and unwraps page', async () => {
    const { inv, calls } = stubbed();
    const page = await inv.kb.pages.create({ path: 'wiki:auth', title: 'Auth', body: 'b' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/v1/kb/pages' });
    expect((calls[0].body as { path: string }).path).toBe('wiki:auth');
    expect(page.id).toBe('kbp_1');
  });

  it('list passes kind, search, cursor, limit', async () => {
    const { inv, calls } = stubbed();
    await inv.kb.pages.list({ kind: 'wiki', search: 'auth', cursor: 'c_1', limit: 5 });
    expect(calls[0].path).toBe('/v1/kb/pages?kind=wiki&search=auth&cursor=c_1&limit=5');
  });

  it('get fetches /v1/kb/pages/:id', async () => {
    const { inv, calls } = stubbed();
    const page = await inv.kb.pages.get('kbp_42');
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/v1/kb/pages/kbp_42' });
    expect(page.id).toBe('kbp_42');
  });

  it('update patches /v1/kb/pages/:id', async () => {
    const { inv, calls } = stubbed();
    await inv.kb.pages.update('kbp_42', { title: 'New' });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].path).toBe('/v1/kb/pages/kbp_42');
  });

  it('delete sends DELETE', async () => {
    const { inv, calls } = stubbed();
    await inv.kb.pages.delete('kbp_42');
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/v1/kb/pages/kbp_42' });
  });
});

describe('KbResource.sessions', () => {
  it('create posts to /v1/kb/sessions', async () => {
    const { inv, calls } = stubbed();
    const session = await inv.kb.sessions.create({ title: 't', model: 'sonnet' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/v1/kb/sessions');
    expect(session.id).toBe('kbs_1');
  });

  it('listMessages fetches /v1/kb/sessions/:id/messages', async () => {
    const { inv, calls } = stubbed();
    const messages = await inv.kb.sessions.listMessages('kbs_9');
    expect(calls[0].path).toBe('/v1/kb/sessions/kbs_9/messages');
    expect(messages).toEqual([{ id: 'kbm_1' }]);
  });

  it('appendMessage posts content to messages endpoint', async () => {
    const { inv, calls } = stubbed();
    await inv.kb.sessions.appendMessage('kbs_9', { role: 'user', content: 'hi' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/v1/kb/sessions/kbs_9/messages');
    expect((calls[0].body as { content: string }).content).toBe('hi');
  });

  it('delete sends DELETE to session', async () => {
    const { inv, calls } = stubbed();
    await inv.kb.sessions.delete('kbs_9');
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/v1/kb/sessions/kbs_9' });
  });
});
