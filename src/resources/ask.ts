import type { HttpClient } from '../client.js';
import type { KbMessage, KbSession } from './kb.js';

export interface AskRequest {
  message: string;
  session_id?: string;
  model?: string;
  max_turns?: number;
}

export interface AskResponse {
  session: KbSession;
  messages: KbMessage[];
  final_text: string;
  turns: number;
}

export class AskResource {
  constructor(private readonly http: HttpClient) {}

  async send(input: AskRequest): Promise<AskResponse> {
    return this.http.post<AskResponse>('/v1/ask', input);
  }
}
