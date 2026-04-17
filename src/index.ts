import { HttpClient } from './client.js';
import { resolveConfig, type InvarianceConfig } from './config.js';
import { RunsResource } from './resources/runs.js';
import { NodesResource } from './resources/nodes.js';
import { AgentsResource } from './resources/agents.js';

export { InvarianceApiError } from './client.js';
export { type InvarianceConfig } from './config.js';
export {
  RunClient,
  RunsResource,
  Step,
  type Run,
  type Session,
  type Node,
  type RunProof,
  type RunProofReason,
  type SessionProof,
  type SessionProofReason,
  type ListResponse,
  type StartRunOptions,
  type StepOptions,
  type WriteNodeOptions,
} from './resources/runs.js';
export { NodesResource, type WriteNodeInput } from './resources/nodes.js';
export { AgentsResource, type Agent, type ApiKeyPublic, type MeResponse } from './resources/agents.js';
export { trace } from './resources/trace.js';
export {
  generateKeypair,
  getPublicKey,
  signEd25519,
  verifyEd25519,
  hashNodePayload,
  stableStringify,
  sha256Hex,
  type Keypair,
  type NodeHashPayload,
} from './crypto.js';

export class Invariance {
  readonly runs: RunsResource;
  readonly nodes: NodesResource;
  readonly agents: AgentsResource;

  private constructor(private readonly http: HttpClient, signingKey: string | null) {
    this.runs = new RunsResource(http, signingKey ?? undefined);
    this.nodes = new NodesResource(http);
    this.agents = new AgentsResource(http);
  }

  static init(config: InvarianceConfig): Invariance {
    const resolved = resolveConfig(config);
    const http = new HttpClient(resolved.apiUrl, resolved.apiKey);
    return new Invariance(http, resolved.signingKey);
  }
}
