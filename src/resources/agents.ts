import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import { withQuery } from './query.js';

export type OperatorType = 'agent' | 'human';

export interface Agent {
  id: string;
  name: string;
  public_key: string | null;
  project_id: string;
  created_at: string;
  /**
   * Whether this operator is an automated agent or a human. Defaults to
   * 'agent' on the platform when omitted from create payloads.
   */
  operator_type?: OperatorType;
}

/** Alias for {@link Agent} used when talking about the operator-brain surface. */
export type Operator = Agent;

export interface ApiKeyPublic {
  id: string;
  prefix: 'inv_test' | 'inv_live';
  label: string;
  created_at: string;
}

export interface ApiKeyWithRaw extends ApiKeyPublic {
  key: string;
}

export interface MeResponse {
  agent: Agent;
  api_key?: ApiKeyPublic;
}

export interface CreateAgentInput {
  name: string;
  project_id: string;
  public_key?: string;
  key_mode?: 'test' | 'live';
}

export interface CreateAgentResponse {
  agent: Agent;
  api_key: ApiKeyWithRaw;
}

export class AgentsResource {
  constructor(private readonly http: HttpClient) {}

  async me(): Promise<MeResponse> {
    return this.http.get<MeResponse>('/v1/agents/me');
  }

  /**
   * Register or rotate the caller's Ed25519 public key (32-byte hex, 64 chars).
   */
  async setPublicKey(publicKey: string): Promise<Agent> {
    const res = await this.http.request<{ agent: Agent }>('PUT', '/v1/agents/me/key', {
      public_key: publicKey,
    });
    return res.agent;
  }

  /** Create an agent in a caller-owned project (requires user JWT auth). */
  async create(input: CreateAgentInput): Promise<CreateAgentResponse> {
    return this.http.post<CreateAgentResponse>('/v1/agents', input);
  }

  async list(opts: { project_id: string }): Promise<ListResponse<Agent>> {
    return this.http.get<ListResponse<Agent>>(withQuery('/v1/agents', opts));
  }

  async get(id: string): Promise<Agent> {
    const res = await this.http.get<{ agent: Agent }>(`/v1/agents/${id}`);
    return res.agent;
  }
}
