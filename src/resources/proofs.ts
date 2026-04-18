import type { HttpClient } from '../client.js';
import type { RunProof } from './runs.js';

export class ProofsResource {
  constructor(private readonly http: HttpClient) {}

  /** Re-verify the hash chain and any signatures on a run. */
  verifyRun(runId: string): Promise<RunProof> {
    return this.http.get<RunProof>(`/v1/runs/${runId}/verify`);
  }
}
