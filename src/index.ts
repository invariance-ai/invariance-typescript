import { HttpClient } from './client.js';
import { resolveConfig, type InvarianceConfig } from './config.js';
import { RunsResource } from './resources/runs.js';
import { NodesResource } from './resources/nodes.js';
import { AgentsResource } from './resources/agents.js';
import { MonitorsResource } from './resources/monitors.js';
import { SignalsResource } from './resources/signals.js';
import { ProofsResource } from './resources/proofs.js';
import { FindingsResource } from './resources/findings.js';
import { ReviewsResource } from './resources/reviews.js';

export { InvarianceApiError } from './client.js';
export { type InvarianceConfig } from './config.js';
export {
  RunClient,
  RunsResource,
  Step,
  type Run,
  type Node,
  type RunProof,
  type RunProofReason,
  type ListResponse,
  type StartRunOptions,
  type StepOptions,
  type WriteNodeOptions,
} from './resources/runs.js';
export { NodesResource, type WriteNodeInput } from './resources/nodes.js';
export {
  AgentsResource,
  type Agent,
  type ApiKeyPublic,
  type ApiKeyWithRaw,
  type MeResponse,
  type CreateAgentInput,
  type CreateAgentResponse,
} from './resources/agents.js';
export { defineNodeType, type NodeType } from './resources/node-types.js';
export { SignalsResource, type Signal, type EmitSignalInput } from './resources/signals.js';
export { defineSignalType, type SignalType, type SignalTypeDefaults } from './resources/signal-types.js';
export {
  MonitorsResource,
  compileMonitor,
  on,
  rule,
  evaluator,
  action,
  type Monitor,
  type MonitorSpec,
  type MonitorListOptions,
  type MonitorEvaluator,
  type MonitorSchedule,
  type MonitorExecution,
  type CreateMonitorRequest,
  type UpdateMonitorRequest,
  type EvaluateMonitorRequest,
  type EvaluateMonitorResponse,
  type On,
  type Rule,
  type Evaluator,
  type When,
  type Action,
  type Severity,
} from './resources/monitors.js';
export { ProofsResource } from './resources/proofs.js';
export { FindingsResource, type Finding, type FindingStatus } from './resources/findings.js';
export {
  ReviewsResource,
  type Review,
  type ReviewDecision,
  type ReviewResolveResponse,
} from './resources/reviews.js';
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
  readonly monitors: MonitorsResource;
  readonly signals: SignalsResource;
  readonly proofs: ProofsResource;
  readonly findings: FindingsResource;
  readonly reviews: ReviewsResource;

  private constructor(private readonly http: HttpClient, signingKey: string | null) {
    this.runs = new RunsResource(http, signingKey ?? undefined);
    this.nodes = new NodesResource(http);
    this.agents = new AgentsResource(http);
    this.monitors = new MonitorsResource(http);
    this.signals = new SignalsResource(http);
    this.proofs = new ProofsResource(http);
    this.findings = new FindingsResource(http);
    this.reviews = new ReviewsResource(http);
  }

  static init(config: InvarianceConfig): Invariance {
    const resolved = resolveConfig(config);
    const http = new HttpClient(resolved.apiUrl, resolved.apiKey);
    return new Invariance(http, resolved.signingKey);
  }
}
