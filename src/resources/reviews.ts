import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import type { Finding } from './findings.js';
import { pagePath, type PageOptions } from './query.js';

export type ReviewDecision = 'passed' | 'failed' | 'needs_fix';

export interface Review {
  id: string;
  agent_id: string;
  finding_id: string;
  status: 'pending' | 'claimed' | 'passed' | 'failed' | 'needs_fix';
  reviewer_agent_id: string | null;
  decision: ReviewDecision | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ReviewResolveResponse {
  review: Review;
  finding: Finding;
}

export class ReviewsResource {
  constructor(private readonly http: HttpClient) {}

  list(opts: PageOptions = {}): Promise<ListResponse<Review>> {
    return this.http.get<ListResponse<Review>>(pagePath('/v1/reviews', opts));
  }

  async get(id: string): Promise<Review> {
    const res = await this.http.get<{ review: Review }>(`/v1/reviews/${id}`);
    return res.review;
  }

  async claim(id: string, opts: { notes?: string } = {}): Promise<Review> {
    const res = await this.http.request<{ review: Review }>('PATCH', `/v1/reviews/${id}`, {
      status: 'claimed',
      ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
    });
    return res.review;
  }

  async unclaim(id: string, opts: { notes?: string } = {}): Promise<Review> {
    const res = await this.http.request<{ review: Review }>('PATCH', `/v1/reviews/${id}`, {
      status: 'pending',
      ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
    });
    return res.review;
  }

  resolve(
    id: string,
    opts: { decision: ReviewDecision; notes?: string },
  ): Promise<ReviewResolveResponse> {
    return this.http.request<ReviewResolveResponse>('PATCH', `/v1/reviews/${id}`, opts);
  }
}
