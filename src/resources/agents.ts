import type { HttpClient } from '../client.js';

export interface Agent {
  id: string;
  name: string;
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
}
