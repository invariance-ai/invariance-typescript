import { HttpClient, InvarianceApiError } from './client.js';
import { resolveConfig, type InvarianceConfig } from './config.js';
import { RunsResource } from './resources/runs.js';
import { NodesResource } from './resources/nodes.js';
import { AgentsResource } from './resources/agents.js';

export { InvarianceApiError } from './client.js';
export { type InvarianceConfig } from './config.js';
export { Run, RunsResource, type Session, type Node, type SessionProof, type ListResponse, type StartRunOptions, type WriteNodeOptions } from './resources/runs.js';
export { NodesResource } from './resources/nodes.js';
export { AgentsResource, type Agent, type ApiKeyPublic, type MeResponse } from './resources/agents.js';

export class Invariance {
  readonly runs: RunsResource;
  readonly nodes: NodesResource;
  readonly agents: AgentsResource;

  private constructor(private readonly http: HttpClient) {
    this.runs = new RunsResource(http);
    this.nodes = new NodesResource(http);
    this.agents = new AgentsResource(http);
  }

  static init(config: InvarianceConfig): Invariance {
    const resolved = resolveConfig(config);
    const http = new HttpClient(resolved.apiUrl, resolved.apiKey);
    return new Invariance(http);
  }
}
