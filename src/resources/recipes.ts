import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import { pagePath, type PageOptions } from './query.js';

export type GuardrailMode = 'suggested' | 'shadow' | 'active_monitor';

export interface Recipe {
  id: string;
  slug: string;
  title: string;
  domain: string;
  description: string;
  control: string;
  rule: string;
  default_mode: GuardrailMode;
  enabled: boolean;
  builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateRecipePatch {
  enabled?: boolean;
  default_mode?: GuardrailMode;
}

/**
 * Read-only registry of built-in operational checks. Use
 * `client.guardrails.create({ recipe_id })` to promote a recipe into a
 * per-agent guardrail.
 */
export class RecipesResource {
  constructor(private readonly http: HttpClient) {}

  list(opts: PageOptions = {}): Promise<ListResponse<Recipe>> {
    return this.http.get<ListResponse<Recipe>>(pagePath('/v1/recipes', opts));
  }

  async get(idOrSlug: string): Promise<Recipe> {
    const res = await this.http.get<{ recipe: Recipe }>(`/v1/recipes/${idOrSlug}`);
    return res.recipe;
  }

  async update(id: string, patch: UpdateRecipePatch): Promise<Recipe> {
    const res = await this.http.request<{ recipe: Recipe }>('PATCH', `/v1/recipes/${id}`, patch);
    return res.recipe;
  }
}
