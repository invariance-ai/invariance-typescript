# Changelog

All notable changes to `@invariance/sdk` are documented here. This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-04-24

Initial MVP release.

### Added

- `Invariance.init()` client with config resolution (env vars + explicit options).
- Resources: `runs`, `nodes`, `monitors`, `signals`, `findings`, `reviews`, `agents`, `proofs`, `narratives`, `node-types`.
- Run lifecycle helpers: `runs.start(...)` with callback form, `run.log`, `run.context`, `run.tool`, `run.step`.
- Node emission against `/v1/trace/events` with canonical hashing.
- Proof verification via `run.verify()`.
- Provider instrumentation for OpenAI and Anthropic (`instrumentOpenAI`, `instrumentAnthropic`).
- Reproducibility helper (`withReproducibility`).
- MCP tools over the same client path.
