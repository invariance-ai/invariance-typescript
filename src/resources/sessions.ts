import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import { withQuery, type PageOptions } from './query.js';

export type AgentSessionSource =
  | 'anthropic_sdk'
  | 'openai_sdk'
  | 'invariance_cli'
  | 'mcp'
  | 'claude_code'
  | 'codex_cli'
  | 'screen_recording'
  | 'microphone'
  | 'meeting'
  | 'granola_note'
  | 'manual_note'
  | 'api'
  | 'other';

export type AgentSessionType =
  | 'coding'
  | 'review'
  | 'meeting'
  | 'note'
  | 'recording'
  | 'other';

export interface AgentSession {
  id: string;
  project_id?: string;
  operator_id?: string | null;
  agent_id?: string | null;
  source: AgentSessionSource;
  session_type?: AgentSessionType | null;
  title?: string | null;
  external_session_id?: string | null;
  model?: string | null;
  cwd?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string | null;
  ended_at?: string | null;
}

export interface CreateAgentSessionRequest {
  source: AgentSessionSource;
  session_type?: AgentSessionType;
  title?: string;
  external_session_id?: string;
  model?: string;
  cwd?: string;
  client_version?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAgentSessionResponse {
  session: AgentSession;
}

export interface AgentSessionEventInput {
  event_type: string;
  payload?: Record<string, unknown>;
  raw?: Record<string, unknown>;
  tool_use_id?: string;
  ts?: string;
  seq?: number;
}

export interface AppendEventsResponse {
  appended: number;
}

export interface ListSessionsOptions extends PageOptions {
  project_id?: string;
  operator_id?: string;
  session_type?: AgentSessionType;
  source?: AgentSessionSource;
}

/**
 * Thin client over /v1/agent-sessions. Mirrors the platform endpoints
 * exposed for the operator-brain feature: a session is the unit of work
 * (a coding stint, a meeting, a note, a recording) attached to an operator.
 *
 * The `from*` helpers are ergonomic wrappers — they normalize the
 * source/session_type combo for common ingestion paths but do NOT parse the
 * underlying transcript. Pass events to `appendEvents` separately.
 */
export class SessionsResource {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreateAgentSessionRequest): Promise<AgentSession> {
    const res = await this.http.post<CreateAgentSessionResponse>(
      '/v1/agent-sessions',
      input,
    );
    return res.session;
  }

  async list(opts: ListSessionsOptions = {}): Promise<ListResponse<AgentSession>> {
    return this.http.get<ListResponse<AgentSession>>(
      withQuery('/v1/agent-sessions', {
        project_id: opts.project_id,
        operator_id: opts.operator_id,
        session_type: opts.session_type,
        source: opts.source,
        cursor: opts.cursor,
        limit: opts.limit,
      }),
    );
  }

  async get(id: string): Promise<AgentSession> {
    const res = await this.http.get<{ session: AgentSession }>(
      `/v1/agent-sessions/${id}`,
    );
    return res.session;
  }

  async appendEvents(
    id: string,
    events: AgentSessionEventInput[],
  ): Promise<AppendEventsResponse> {
    return this.http.post<AppendEventsResponse>(
      `/v1/agent-sessions/${id}/events`,
      { events },
    );
  }

  // ── Ergonomic wrappers ────────────────────────────────────────────────

  /**
   * Open a session that represents a Claude Code (or similar agentic
   * coding) run. Defaults source=claude_code, session_type=coding.
   */
  async fromClaudeCode(
    input: Omit<CreateAgentSessionRequest, 'source' | 'session_type'> & {
      source?: AgentSessionSource;
      session_type?: AgentSessionType;
    } = {},
  ): Promise<AgentSession> {
    return this.create({
      source: input.source ?? 'claude_code',
      session_type: input.session_type ?? 'coding',
      ...input,
    });
  }

  /**
   * Open a session backed by meeting transcript/audio. Defaults
   * source=meeting, session_type=meeting.
   */
  async fromMeetingNotes(
    input: Omit<CreateAgentSessionRequest, 'source' | 'session_type'> & {
      source?: AgentSessionSource;
      session_type?: AgentSessionType;
    } = {},
  ): Promise<AgentSession> {
    return this.create({
      source: input.source ?? 'meeting',
      session_type: input.session_type ?? 'meeting',
      ...input,
    });
  }

  /**
   * Open a session backed by a Granola note export. Defaults
   * source=granola_note, session_type=note.
   */
  async fromGranolaNote(
    input: Omit<CreateAgentSessionRequest, 'source' | 'session_type'> & {
      source?: AgentSessionSource;
      session_type?: AgentSessionType;
    } = {},
  ): Promise<AgentSession> {
    return this.create({
      source: input.source ?? 'granola_note',
      session_type: input.session_type ?? 'note',
      ...input,
    });
  }
}
