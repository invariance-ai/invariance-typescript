import type { Command } from 'commander';

const TOPICS: Record<string, string> = {
  quickstart: `# Invariance CLI Quickstart

1. Log in:
     $ invariance auth login
   Paste your API key when prompted. Keys live at ~/.invariance/credentials.json
   (mode 600). Env var INVARIANCE_API_KEY and the --api-key flag also work.

2. Confirm identity:
     $ invariance auth whoami

3. Start a run and write trace nodes:
     $ RUN=$(invariance runs start --name demo --json | jq -r .id)
     $ invariance nodes write "$RUN" --action-type tool_call --input '{"x":1}' --output '{"y":2}'

4. Verify the proof chain:
     $ invariance runs verify "$RUN"

5. Create a monitor, evaluate, and check findings:
     $ invariance monitors create --file monitor.json
     $ invariance monitors evaluate mon_... --run-id "$RUN"
     $ invariance findings list

6. Review workflow:
     $ invariance reviews list
     $ invariance reviews claim rev_...
     $ invariance reviews resolve rev_... --decision passed

Every command supports --json | --output table|yaml, --profile, --api-key, --api-url.
`,
  auth: `# Authentication

Credential precedence: --api-key flag > INVARIANCE_API_KEY env > ~/.invariance/credentials.json.

Commands:
  invariance auth login [--profile name]   Store a profile (prompts for key).
  invariance auth logout [--profile name]  Remove a profile.
  invariance auth whoami                   Call /v1/agents/me.
  invariance auth status                   Show active profile + source.
  invariance auth list                     List stored profiles.

Multi-workspace: use --profile <name> on any command to switch accounts.
Signing keys (Ed25519 hex) can be stored per profile for node signing.
`,
  runs: `# Runs

A run is a single agent execution session. Nodes hang off runs.

Common operations:
  runs start --name <n> [--metadata <json>]
  runs list [--limit] [--cursor] [--all]
  runs show <id>
  runs update <id> [--status] [--metadata <json>]
  runs cancel <id> [--reason]
  runs fork <id> --from-node <node_id>
  runs metrics <id>
  runs verify <id>             -> cryptographic proof of hash chain
  runs narrative <id>          -> LLM-generated summary
  runs llm-calls <id>
  runs nodes <id>              -> list nodes (see also: nodes list)
`,
  nodes: `# Nodes

Nodes are trace events (tool calls, LLM completions, steps). They hash-link into
a Merkle chain that backs run verification.

  nodes write <run_id> --action-type <t> [--input <json>] [--output <json>]
  nodes write <run_id> --file trace.jsonl       (one JSON object per line, batched 100)
  nodes list <run_id> [--limit] [--cursor]

Fields: action_type, type, input, output, error, metadata, custom_fields,
timestamp, duration_ms, parent_id, previous_hashes, signature.
`,
  monitors: `# Monitors

Rules that evaluate over runs/nodes and produce signals, findings, reviews.

  monitors create --file spec.json
  monitors list
  monitors show <id>
  monitors update <id> [--file] [--patch <json>] [--enabled true|false]
  monitors pause <id> / resume <id>
  monitors evaluate <id> [--run-id] [--since] [--limit]
  monitors executions <id>
  monitors findings <id>

Evaluator shapes:
  { "type": "keyword", "field": "output.text", "keywords": ["error"], "case_sensitive": false }
  { "type": "threshold", "field": "metadata.latency_ms", "operator": ">", "value": 5000 }
`,
  signals: `# Signals

Alerts emitted by monitors, detectors, or manually by agents.

  signals emit --severity high --title "anomaly" [--message] [--type] [--run-id] [--node-id] [--data <json>]
  signals list
  signals show <id>
  signals ack <id>
  signals resolve <id>
`,
  findings: `# Findings

Investigation records created by create_finding actions. Findings drive reviews.

  findings list
  findings show <id>
  findings update <id> --status open|review_requested|resolved|dismissed
`,
  reviews: `# Reviews

Human/agent decisions on findings.

  reviews list / show <id>
  reviews claim <id> [--notes]
  reviews unclaim <id>
  reviews resolve <id> --decision passed|failed|needs_fix [--notes]
`,
  agents: `# Agents

  agents create --project-id <p> --name <n>   (requires user JWT auth)
  agents list --project-id <p>
  agents show <id>
  agents me
  agents rotate-key [--out <path>]            -> generates Ed25519 keypair,
                                                 registers public, writes private locally.
`,
  trace: `# Trace utilities

  trace tail <run_id> [--interval 2000] [--limit]
     Polls GET /v1/runs/:id/nodes with a cursor and streams new nodes as they appear.
     Useful when an agent wants to watch its own (or a peer's) run in flight.
`,
  metrics: `# Metrics

  metrics overview [--from <iso>] [--to <iso>] [--project-id <p>]
     Aggregates tokens, cost, latency, and counts across runs.
`,
};

export function register(program: Command): void {
  const docs = program
    .command('docs [topic]')
    .description('Inline docs (topics: quickstart, auth, runs, nodes, monitors, signals, findings, reviews, agents, trace, metrics)')
    .action((topic?: string) => {
      if (!topic) {
        process.stdout.write('Topics:\n');
        for (const name of Object.keys(TOPICS)) process.stdout.write(`  - ${name}\n`);
        process.stdout.write('\nRun `invariance docs <topic>` to view.\n');
        return;
      }
      const body = TOPICS[topic];
      if (!body) {
        process.stderr.write(`Unknown topic: ${topic}\n`);
        process.exit(1);
      }
      process.stdout.write(body);
    });

  program
    .command('completions <shell>')
    .description('Print shell completion script (bash|zsh|fish)')
    .action((shell: string) => {
      const commands = [
        'runs', 'nodes', 'monitors', 'signals', 'findings', 'reviews',
        'agents', 'metrics', 'trace', 'auth', 'docs', 'completions',
      ];
      if (shell === 'bash') {
        process.stdout.write(`_invariance() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${commands.join(' ')}" -- "$cur") )
  fi
}
complete -F _invariance invariance
`);
      } else if (shell === 'zsh') {
        process.stdout.write(`#compdef invariance
_invariance() {
  local -a cmds
  cmds=(${commands.map((c) => `'${c}'`).join(' ')})
  if (( CURRENT == 2 )); then
    _describe 'command' cmds
  fi
}
_invariance "$@"
`);
      } else if (shell === 'fish') {
        for (const c of commands) {
          process.stdout.write(
            `complete -c invariance -f -n "__fish_use_subcommand" -a "${c}"\n`,
          );
        }
      } else {
        process.stderr.write(`Unsupported shell: ${shell}. Use bash, zsh, or fish.\n`);
        process.exit(1);
      }
    });
  void docs;
}
