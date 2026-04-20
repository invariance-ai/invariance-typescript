import type { HttpClient } from '../client.js';

export type NarrativeProvider = 'anthropic' | 'openai' | 'google';
export type NarrativeScorer = 'severity';

export interface Narrative {
  run_id: string;
  agent_id: string;
  narrative: string;
  key_moments: string[];
  root_cause: string;
  /** Scorer used to select nodes for synthesis. Reserved for future scorers (v1: 'severity' only). */
  scorer: NarrativeScorer;
  model: string;
  provider: NarrativeProvider;
  scored_node_count: number;
  total_node_count: number;
  created_at: string;
  updated_at: string;
}

export interface GetNarrativeOptions {
  /** Force re-synthesis of the narrative, overwriting any cached version. */
  refresh?: boolean;
}

/**
 * Narrative reports are backend-generated LLM summaries of a run. The backend
 * lazy-generates on first fetch and caches the result; pass `refresh: true`
 * to force regeneration.
 *
 * Returns 503 on the server if no LLM provider is configured — surfaced here
 * as an `InvarianceApiError` with status 503.
 */
export class NarrativesResource {
  constructor(private readonly http: HttpClient) {}

  async get(runId: string, opts: GetNarrativeOptions = {}): Promise<Narrative> {
    const qs = opts.refresh ? '?refresh=true' : '';
    const res = await this.http.get<{ narrative: Narrative }>(`/v1/runs/${runId}/narrative${qs}`);
    return res.narrative;
  }
}
