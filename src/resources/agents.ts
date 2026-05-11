import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import { withQuery } from './query.js';

export interface Agent {
  id: string;
  name: string;
  operator_type?: 'agent' | 'human';
  public_key: string | null;
  project_id: string;
  created_at: string;
}

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
  operator?: Operator;
  api_key?: ApiKeyPublic;
}

export interface CreateAgentInput {
  name: string;
  project_id: string;
  operator_type?: 'agent' | 'human';
  public_key?: string;
  key_mode?: 'test' | 'live';
}

export interface CreateAgentResponse {
  agent: Agent;
  operator?: Operator;
  api_key: ApiKeyWithRaw;
}

export class AgentsResource {
  constructor(protected readonly http: HttpClient) {}

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

export class OperatorsResource extends AgentsResource {
  override async me(): Promise<MeResponse> {
    return this.http.get<MeResponse>('/v1/operators/me');
  }

  override async create(input: CreateAgentInput): Promise<CreateAgentResponse> {
    return this.http.post<CreateAgentResponse>('/v1/operators', input);
  }

  override async list(opts: { project_id: string }): Promise<ListResponse<Operator>> {
    return this.http.get<ListResponse<Operator>>(withQuery('/v1/operators', opts));
  }

  override async get(id: string): Promise<Operator> {
    const res = await this.http.get<{ operator?: Operator; agent?: Agent }>(`/v1/operators/${id}`);
    return res.operator ?? res.agent!;
  }
}
