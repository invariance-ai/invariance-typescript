import type { HttpClient } from '../client.js';

export type WorkflowFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'url'
  | 'currency_usd'
  | 'enum';

export type WorkflowOutcomeKind = 'success' | 'failure' | 'neutral';

export interface WorkflowDefinitionField {
  name: string;
  type: WorkflowFieldType;
  label?: string;
  required?: boolean;
  description?: string;
  enum?: string[];
}

export interface WorkflowDefinitionStep {
  type: string;
  label?: string;
  required?: boolean;
  description?: string;
}

export interface WorkflowDefinitionOutcome {
  value: string;
  label?: string;
  kind?: WorkflowOutcomeKind;
}

export type WorkflowMetricWidget =
  | { kind: 'count'; label: string; event_type?: string }
  | { kind: 'sum_field'; label: string; field: string }
  | { kind: 'avg_field'; label: string; field: string };

export interface WorkflowDefinition {
  key: string;
  agent_id: string;
  display_name: string;
  description: string | null;
  expected_fields: WorkflowDefinitionField[];
  expected_steps: WorkflowDefinitionStep[];
  allowed_outcomes: WorkflowDefinitionOutcome[];
  custom_metrics: WorkflowMetricWidget[];
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowDefinitionOptions {
  key: string;
  displayName: string;
  description?: string | null;
  expectedFields?: WorkflowDefinitionField[];
  expectedSteps?: WorkflowDefinitionStep[];
  allowedOutcomes?: WorkflowDefinitionOutcome[];
  customMetrics?: WorkflowMetricWidget[];
}

export interface UpdateWorkflowDefinitionOptions {
  displayName?: string;
  description?: string | null;
  expectedFields?: WorkflowDefinitionField[];
  expectedSteps?: WorkflowDefinitionStep[];
  allowedOutcomes?: WorkflowDefinitionOutcome[];
  customMetrics?: WorkflowMetricWidget[];
}

function createBody(opts: CreateWorkflowDefinitionOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    key: opts.key,
    display_name: opts.displayName,
  };
  if (opts.description !== undefined) body.description = opts.description;
  if (opts.expectedFields !== undefined) body.expected_fields = opts.expectedFields;
  if (opts.expectedSteps !== undefined) body.expected_steps = opts.expectedSteps;
  if (opts.allowedOutcomes !== undefined) body.allowed_outcomes = opts.allowedOutcomes;
  if (opts.customMetrics !== undefined) body.custom_metrics = opts.customMetrics;
  return body;
}

function updateBody(opts: UpdateWorkflowDefinitionOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (opts.displayName !== undefined) body.display_name = opts.displayName;
  if (opts.description !== undefined) body.description = opts.description;
  if (opts.expectedFields !== undefined) body.expected_fields = opts.expectedFields;
  if (opts.expectedSteps !== undefined) body.expected_steps = opts.expectedSteps;
  if (opts.allowedOutcomes !== undefined) body.allowed_outcomes = opts.allowedOutcomes;
  if (opts.customMetrics !== undefined) body.custom_metrics = opts.customMetrics;
  return body;
}

export class WorkflowDefinitionsResource {
  constructor(private readonly http: HttpClient) {}

  async create(opts: CreateWorkflowDefinitionOptions): Promise<WorkflowDefinition> {
    const res = await this.http.post<{ definition: WorkflowDefinition }>(
      '/v1/workflow-definitions',
      createBody(opts),
    );
    return res.definition;
  }

  async list(): Promise<WorkflowDefinition[]> {
    const res = await this.http.get<{ data: WorkflowDefinition[] }>('/v1/workflow-definitions');
    return res.data;
  }

  async get(key: string): Promise<WorkflowDefinition> {
    const res = await this.http.get<{ definition: WorkflowDefinition }>(
      `/v1/workflow-definitions/${encodeURIComponent(key)}`,
    );
    return res.definition;
  }

  async update(key: string, opts: UpdateWorkflowDefinitionOptions): Promise<WorkflowDefinition> {
    const res = await this.http.patch<{ definition: WorkflowDefinition }>(
      `/v1/workflow-definitions/${encodeURIComponent(key)}`,
      updateBody(opts),
    );
    return res.definition;
  }

  async delete(key: string): Promise<void> {
    await this.http.delete(`/v1/workflow-definitions/${encodeURIComponent(key)}`);
  }
}
