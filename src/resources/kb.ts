import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import { withQuery, pagePath, type PageOptions } from './query.js';

export type KbPageKind = 'wiki' | 'run' | 'note';

export interface KbPage {
  id: string;
  agent_id: string;
  project_id: string;
  path: string;
  title: string;
  summary: string;
  body: string;
  kind: KbPageKind;
  created_at: string;
  updated_at: string;
}

export interface KbSession {
  id: string;
  agent_id: string;
  project_id: string;
  title: string;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export type AskRole = 'user' | 'assistant' | 'tool';

export type AskContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface KbMessage {
  id: string;
  session_id: string;
  role: AskRole;
  content: string | AskContentBlock[];
  created_at: string;
}

export interface CreateKbPageInput {
  path: string;
  title: string;
  body: string;
  summary?: string;
  kind?: KbPageKind;
}

export interface UpdateKbPageInput {
  title?: string;
  body?: string;
  summary?: string;
  kind?: KbPageKind;
}

export interface ListKbPagesOptions extends PageOptions {
  kind?: KbPageKind;
  search?: string;
}

export interface CreateKbSessionInput {
  title?: string;
  model?: string;
}

export interface AppendKbMessageInput {
  role?: AskRole;
  content: string | AskContentBlock[];
}

export class KbPagesResource {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreateKbPageInput): Promise<KbPage> {
    const res = await this.http.post<{ page: KbPage }>('/v1/kb/pages', input);
    return res.page;
  }

  async list(opts: ListKbPagesOptions = {}): Promise<ListResponse<KbPage>> {
    const path = withQuery('/v1/kb/pages', {
      kind: opts.kind,
      search: opts.search,
      cursor: opts.cursor,
      limit: opts.limit,
    });
    return this.http.get<ListResponse<KbPage>>(path);
  }

  async get(id: string): Promise<KbPage> {
    const res = await this.http.get<{ page: KbPage }>(`/v1/kb/pages/${id}`);
    return res.page;
  }

  async update(id: string, input: UpdateKbPageInput): Promise<KbPage> {
    const res = await this.http.patch<{ page: KbPage }>(`/v1/kb/pages/${id}`, input);
    return res.page;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/v1/kb/pages/${id}`);
  }
}

export class KbSessionsResource {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreateKbSessionInput = {}): Promise<KbSession> {
    const res = await this.http.post<{ session: KbSession }>('/v1/kb/sessions', input);
    return res.session;
  }

  async list(opts: PageOptions = {}): Promise<ListResponse<KbSession>> {
    return this.http.get<ListResponse<KbSession>>(pagePath('/v1/kb/sessions', opts));
  }

  async get(id: string): Promise<KbSession> {
    const res = await this.http.get<{ session: KbSession }>(`/v1/kb/sessions/${id}`);
    return res.session;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/v1/kb/sessions/${id}`);
  }

  async listMessages(id: string): Promise<KbMessage[]> {
    const res = await this.http.get<{ messages: KbMessage[] }>(`/v1/kb/sessions/${id}/messages`);
    return res.messages;
  }

  async appendMessage(id: string, input: AppendKbMessageInput): Promise<KbMessage> {
    const res = await this.http.post<{ message: KbMessage }>(
      `/v1/kb/sessions/${id}/messages`,
      input,
    );
    return res.message;
  }
}

export class KbResource {
  readonly pages: KbPagesResource;
  readonly sessions: KbSessionsResource;

  constructor(http: HttpClient) {
    this.pages = new KbPagesResource(http);
    this.sessions = new KbSessionsResource(http);
  }
}
