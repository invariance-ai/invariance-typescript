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
import { NarrativesResource } from './resources/narratives.js';
import { NodeTypesResource } from './resources/node-types.js';
import { KbResource } from './resources/kb.js';
import { AskResource } from './resources/ask.js';
import { EvalsResource } from './resources/evals.js';
import { MemoryResource } from './resources/memory.js';
import { RecipesResource } from './resources/recipes.js';
import { GuardrailsResource } from './resources/guardrails.js';
import { OperatorsResource } from './resources/operators.js';
import { SessionsResource } from './resources/sessions.js';
import { CasesResource } from './resources/cases.js';
import { WorkflowEventsResource } from './resources/workflow-events.js';
import { WorkflowDefinitionsResource } from './resources/workflow-definitions.js';
import { CortexResource } from './resources/cortex.js';

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
  type Agent,
  type Operator,
  type OperatorType,
  type ApiKeyPublic,
  type ApiKeyWithRaw,
  type MeResponse,
  type CreateAgentInput,
  type CreateAgentResponse,
} from './resources/agents.js';
export {
  OperatorsResource,
  type OperatorMeResponse,
  type CreateOperatorInput,
  type CreateOperatorResponse,
  type ListOperatorsOptions,
} from './resources/operators.js';
export {
  SessionsResource,
  type AgentSession,
  type AgentSessionSource,
  type AgentSessionType,
  type CreateAgentSessionRequest,
  type CreateAgentSessionResponse,
  type AgentSessionEventInput,
  type AppendEventsResponse,
  type ListSessionsOptions,
} from './resources/sessions.js';
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
  RecipesResource,
  type Recipe,
  type GuardrailMode,
  type UpdateRecipePatch,
} from './resources/recipes.js';
export {
  GuardrailsResource,
  type Guardrail,
  type GuardrailStatus,
  type CreateGuardrailInput,
  type UpdateGuardrailPatch,
  type GuardrailListOptions,
} from './resources/guardrails.js';
export {
  CasesResource,
  type Case,
  type CaseStatus,
  type CaseWithRuns,
  type CreateCaseOptions,
  type UpdateCaseOptions,
  type CloseCaseOptions,
} from './resources/cases.js';
export {
  WorkflowEventsResource,
  type WorkflowEvent,
  type WorkflowEventActorType,
  type WorkflowEvidenceRef,
  type EvidenceRefKind,
  type CreateWorkflowEventOptions,
  type WorkflowEventListOptions,
} from './resources/workflow-events.js';
export {
  WorkflowDefinitionsResource,
  type WorkflowDefinition,
  type WorkflowDefinitionField,
  type WorkflowDefinitionStep,
  type WorkflowDefinitionOutcome,
  type WorkflowFieldType,
  type WorkflowOutcomeKind,
  type WorkflowMetricWidget,
  type CreateWorkflowDefinitionOptions,
  type UpdateWorkflowDefinitionOptions,
} from './resources/workflow-definitions.js';
export type {
  OperationalEntity,
  OperationalEdge,
  OperationalEdgeProvenance,
  OperationalFinding,
  OperationalFindingEvidence,
  OperationalGraphCompleteness,
  OperationalGraphResponse,
} from './resources/runs.js';
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
export {
  CortexResource,
  CortexJobsResource,
  type CortexJobKind,
  type CortexTargetType,
  type CortexJobStatus,
  type CortexJobCriteria,
  type CortexJobInputRefs,
  type CortexJobOptions,
  type CreateCortexJobInput,
  type CreateCortexJobResponse,
  type CortexJob,
  type CortexJobResult,
  type CortexJobResultPayload,
  type WorkflowEvalResult,
  type CounterfactualEvalResult,
  type OutcomeAttributionResult,
  type OutcomeAttributionFactor,
  type CortexCriterionResult,
} from './resources/cortex.js';
export {
  EvalsResource,
  EvalDatasetsNamespace,
  EvalScorersNamespace,
  EvalSuitesNamespace,
  EvalCasesNamespace,
  EvalRunsNamespace,
  EvalExperimentsNamespace,
  readEvalMetadata,
  deriveStatus,
  type EvalMetadata,
  type EvalRunCaseOptions,
  type EvalResult,
  type EvalCaseRecord,
  type EvalListResponse,
  type EvalSummary,
  type EvalStatus,
  type EvalSuite,
  type EvalDataset,
  type EvalDatasetExample,
  type EvalScorer,
  type EvalScorerKind,
  type EvalCase,
  type EvalRun,
  type EvalSuiteRunStatus,
  type EvalResultStatus,
  type EvalResultRow,
  type EvalResultFailure,
  type EvalAssertion,
  type EvalExpectedOutput,
  type EvalTargetType,
  type CounterfactualReplayMutation,
  type CreateEvalSuiteInput,
  type CreateEvalDatasetInput,
  type AppendDatasetExampleInput,
  type CreateEvalScorerInput,
  type CreateEvalCaseInput,
  type CreateEvalCaseFromRunInput,
  type StartEvalRunInput,
  type ScorerName,
  type ScorerSpec,
  type ExperimentRunRequest,
  type ScoreDelta,
  type CaseScoreDelta,
  type CompareResponse,
  type BuiltinScorerInfo,
} from './resources/evals.js';
export { trace } from './resources/trace.js';
export {
  MemoryResource,
  buildMemoryReadBody,
  buildMemoryWriteBody,
  type MemoryRecord,
  type MemoryAccess,
  type MemoryDivergence,
  type MemorySubjectType,
  type MemorySource,
  type MemoryAccessType,
  type MemoryDivergenceKind,
  type MemoryDivergenceStatus,
  type MemoryReadInput,
  type MemoryWriteInput,
  type MemoryReadResponse,
  type MemoryWriteResponse,
  type EvidenceRef,
  type SystemRecord,
} from './resources/memory.js';
export {
  emptyOperationalContext,
  type OperationalContext,
} from './resources/operational-context.js';
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
  readonly sessions: SessionsResource;
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
  readonly evals: EvalsResource;
  readonly memory: MemoryResource;
  readonly recipes: RecipesResource;
  readonly guardrails: GuardrailsResource;
  readonly cases: CasesResource;
  readonly events: WorkflowEventsResource;
  readonly workflowDefinitions: WorkflowDefinitionsResource;
  readonly cortex: CortexResource;

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
    this.sessions = new SessionsResource(http);
    this.monitors = new MonitorsResource(http);
    this.signals = new SignalsResource(http);
    this.proofs = new ProofsResource(http);
    this.findings = new FindingsResource(http);
    this.reviews = new ReviewsResource(http);
    this.narratives = new NarrativesResource(http);
    this.nodeTypes = new NodeTypesResource(http);
    this.kb = new KbResource(http);
    this.ask = new AskResource(http);
    this.evals = new EvalsResource(http, this.runs);
    this.memory = new MemoryResource(http);
    this.recipes = new RecipesResource(http);
    this.guardrails = new GuardrailsResource(http);
    this.cases = new CasesResource(http);
    this.events = new WorkflowEventsResource(http);
    this.workflowDefinitions = new WorkflowDefinitionsResource(http);
    this.cortex = new CortexResource(http);
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
