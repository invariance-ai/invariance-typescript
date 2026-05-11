import { HttpClient } from './client.js';
import { resolveConfig, type InvarianceConfig } from './config.js';
import { RunsResource } from './resources/runs.js';
import { NodesResource } from './resources/nodes.js';
import { AgentsResource, OperatorsResource } from './resources/agents.js';
import { MonitorsResource } from './resources/monitors.js';
import { SignalsResource } from './resources/signals.js';
import { ProofsResource } from './resources/proofs.js';
import { FindingsResource } from './resources/findings.js';
import { ReviewsResource } from './resources/reviews.js';
import { NarrativesResource } from './resources/narratives.js';
import { NodeTypesResource } from './resources/node-types.js';
import { KbResource } from './resources/kb.js';
import { AskResource } from './resources/ask.js';

export { InvarianceApiError, RateLimitError } from './client.js';
export type { RetryPolicy, HttpClientOptions } from './client.js';
export { DEFAULT_API_URL, resolveConfig, type InvarianceConfig, type Features, type ResolvedConfig } from './config.js';
export { withReproducibility, type ReproducibilityOptions } from './replay.js';
export { instrumentOpenAI, instrumentAnthropic, priceCall, registerPricing, type PricingEntry } from './providers/index.js';
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
  type HandoffOptions,
  type LogOptions,
  type ContextOptions,
  type ToolOptions,
} from './resources/runs.js';
export { HandoffToken, buildHandoffToken, type HandoffTokenClaims } from './handoff-token.js';
export { NodesResource, type WriteNodeInput } from './resources/nodes.js';
export {
  AgentsResource,
  OperatorsResource,
  type Agent,
  type Operator,
  type ApiKeyPublic,
  type ApiKeyWithRaw,
  type MeResponse,
  type CreateAgentInput,
  type CreateAgentResponse,
} from './resources/agents.js';
export {
  defineNodeType,
  defineToolCallType,
  NodeTypesResource,
  type NodeType,
  type NodeTypeRecord,
  type NodeTypeSchema,
  type NodeTypeAggregationHints,
  type RegisterNodeTypeInput,
  type ToolCallFields,
} from './resources/node-types.js';
export { SignalsResource, type Signal, type EmitSignalInput } from './resources/signals.js';
export { defineSignalType, type SignalType, type SignalTypeDefaults } from './resources/signal-types.js';
export {
  MonitorsResource,
  compileMonitor,
  on,
  rule,
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
  type NumericOp,
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
export {
  NarrativesResource,
  type Narrative,
  type NarrativeProvider,
  type NarrativeScorer,
  type GetNarrativeOptions,
} from './resources/narratives.js';
export {
  KbResource,
  KbPagesResource,
  KbSessionsResource,
  type KbPage,
  type KbPageKind,
  type KbSession,
  type KbMessage,
  type AskRole,
  type AskContentBlock,
  type CreateKbPageInput,
  type UpdateKbPageInput,
  type ListKbPagesOptions,
  type CreateKbSessionInput,
  type AppendKbMessageInput,
} from './resources/kb.js';
export { AskResource, type AskRequest, type AskResponse } from './resources/ask.js';
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
  readonly operators: OperatorsResource;
  readonly monitors: MonitorsResource;
  readonly signals: SignalsResource;
  readonly proofs: ProofsResource;
  readonly findings: FindingsResource;
  readonly reviews: ReviewsResource;
  readonly features: import('./config.js').Features;
  readonly narratives: NarrativesResource;
  readonly nodeTypes: NodeTypesResource;
  readonly kb: KbResource;
  readonly ask: AskResource;

  private constructor(
    private readonly http: HttpClient,
    signingKey: string | null,
    features: import('./config.js').Features,
  ) {
    this.features = features;
    this.runs = new RunsResource(http, signingKey ?? undefined, features);
    this.nodes = new NodesResource(http);
    this.agents = new AgentsResource(http);
    this.operators = new OperatorsResource(http);
    this.monitors = new MonitorsResource(http);
    this.signals = new SignalsResource(http);
    this.proofs = new ProofsResource(http);
    this.findings = new FindingsResource(http);
    this.reviews = new ReviewsResource(http);
    this.narratives = new NarrativesResource(http);
    this.nodeTypes = new NodeTypesResource(http);
    this.kb = new KbResource(http);
    this.ask = new AskResource(http);
  }

  static init(
    config: InvarianceConfig = {},
    options: import('./client.js').HttpClientOptions = {},
  ): Invariance {
    const resolved = resolveConfig(config);
    const http = new HttpClient(resolved.apiUrl, resolved.apiKey, options);
    return new Invariance(http, resolved.signingKey, resolved.features);
  }
}
