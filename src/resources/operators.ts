import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import { withQuery } from './query.js';
import type {
  ApiKeyPublic,
  ApiKeyWithRaw,
  Operator,
  OperatorType,
} from './agents.js';

export interface OperatorMeResponse {
  operator: Operator;
  api_key?: ApiKeyPublic;
}

export interface CreateOperatorInput {
  name: string;
  project_id: string;
  /** Defaults to 'agent' server-side when omitted. */
  operator_type?: OperatorType;
  public_key?: string;
  key_mode?: 'test' | 'live';
}

export interface CreateOperatorResponse {
  /**
   * Named `agent` on the wire (mirrors createAgent shape) but represents an
   * operator of any type.
   */
  agent: Operator;
  api_key: ApiKeyWithRaw;
}

export interface ListOperatorsOptions {
  project_id: string;
  operator_type?: OperatorType;
}

/**
 * Operators are the unified concept covering both autonomous agents and
 * human teammates that contribute sessions to the company brain. The wire
 * shape mirrors AgentsResource intentionally — server enforces uniqueness
 * differently per type.
 */
export class OperatorsResource {
  constructor(private readonly http: HttpClient) {}

  async me(): Promise<OperatorMeResponse> {
    return this.http.get<OperatorMeResponse>('/v1/operators/me');
  }

  async create(input: CreateOperatorInput): Promise<CreateOperatorResponse> {
    return this.http.post<CreateOperatorResponse>('/v1/operators', input);
  }

  async list(opts: ListOperatorsOptions): Promise<ListResponse<Operator>> {
    return this.http.get<ListResponse<Operator>>(
      withQuery('/v1/operators', {
        project_id: opts.project_id,
        operator_type: opts.operator_type,
      }),
    );
  }

  async get(id: string): Promise<Operator> {
    const res = await this.http.get<{ operator: Operator }>(`/v1/operators/${id}`);
    return res.operator;
  }
}
