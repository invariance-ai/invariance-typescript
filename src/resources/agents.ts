import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import { withQuery } from './query.js';
import {
  getPublicKey,
  hashKeyRotationPayload,
  signEd25519,
  type KeyRotationHashPayload,
} from '../crypto.js';

export interface Agent {
  id: string;
  name: string;
  public_key: string | null;
  project_id: string;
  created_at: string;
}

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
   * Register the caller's Ed25519 public key (bootstrap, 64-char hex). Prefer
   * `rotateKey` when an agent already has a registered key — the backend
   * rejects unsigned rotations.
   */
  async setPublicKey(publicKey: string): Promise<Agent> {
    const res = await this.http.request<{ agent: Agent }>('PUT', '/v1/agents/me/key', {
      public_key: publicKey,
    });
    return res.agent;
  }

  /**
   * Rotate (or first-time register) the caller's Ed25519 public key with a
   * signed payload proving control of the **new** private key. Required when
   * the agent already has a registered key; recommended on bootstrap.
   *
   * @param newPrivateKey   The 64-char hex Ed25519 private key to install.
   * @param prevPublicKey   The currently-registered public_key hex, or null on
   *                        bootstrap. Backend cross-checks against the stored
   *                        value and rejects mismatches.
   */
  async rotateKey(newPrivateKey: string, prevPublicKey: string | null = null): Promise<Agent> {
    const newPublicKey = getPublicKey(newPrivateKey);
    const me = await this.me();
    const timestamp = Date.now();
    const payload: KeyRotationHashPayload = {
      agent_id: me.agent.id,
      new_public_key: newPublicKey,
      prev_public_key: prevPublicKey,
      timestamp,
    };
    const hash = hashKeyRotationPayload(payload);
    const signature = signEd25519(hash, newPrivateKey);
    const res = await this.http.request<{ agent: Agent }>('PUT', '/v1/agents/me/key', {
      public_key: newPublicKey,
      prev_public_key: prevPublicKey,
      timestamp,
      signature,
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
