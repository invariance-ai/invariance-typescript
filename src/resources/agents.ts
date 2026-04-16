import type { HttpClient } from '../client.js';

export interface Agent {
  id: string;
  name: string;
  public_key: string | null;
  created_at: string;
}

export interface ApiKeyPublic {
  id: string;
  prefix: string;
  label: string;
  created_at: string;
}

export interface MeResponse {
  agent: Agent;
  api_key?: ApiKeyPublic;
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
}
