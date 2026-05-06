/**
 * Browser-use agent wrapping.
 *
 * Wraps a `browser_use.Agent`-shaped object so that every browser step (click,
 * type, navigate, scroll, screenshot) emits a `browser_action` node on the
 * Invariance run. If the underlying agent exposes a `screenshot()` method, the
 * provider captures one per step and uploads it as an artifact attached to
 * the same node.
 *
 * The interface is structural — we don't depend on the `browser-use` package
 * at compile time. Anything matching `BrowserUseLike` works (Playwright +
 * custom loops, Stagehand, etc.).
 *
 * Usage:
 *   const agent = new Agent({ task, llm });
 *   const wrapped = instrumentBrowserUse(agent, run, { artifacts: inv.artifacts });
 *   await wrapped.run();
 */

import type { RunClient } from '../resources/runs.js';
import type { ArtifactsResource, ArtifactRef } from '../resources/artifacts.js';

export interface BrowserStepResult {
  /** Action name the agent took: 'click' | 'type' | 'navigate' | 'scroll' | 'extract' | string. */
  action?: string;
  /** Selector / URL / text the action targeted. */
  target?: unknown;
  /** Result the agent produced for this step. */
  output?: unknown;
  /** Whether the agent considers the task done after this step. */
  done?: boolean;
}

export interface BrowserUseLike {
  /** Run one step of the agent loop. Returning `{done: true}` terminates `run()`. */
  step?: (...args: unknown[]) => Promise<BrowserStepResult | undefined>;
  /** Run the agent loop end-to-end (calls `step` repeatedly). */
  run?: (...args: unknown[]) => Promise<unknown>;
  /** Capture the current viewport. PNG bytes preferred. */
  screenshot?: () => Promise<Uint8Array | { data: Uint8Array; mime?: string }>;
  /** Optional reference back to the underlying browser/page for advanced wrappers. */
  browser?: unknown;
  page?: unknown;
}

export interface InstrumentBrowserUseOptions {
  /** Required to capture screenshot artifacts. Pass `inv.artifacts`. */
  artifacts?: ArtifactsResource;
  /** Capture a screenshot per step. Defaults to true when `artifacts` is provided. */
  captureScreenshots?: boolean;
  /** Override the action_type emitted for steps. Default: 'browser_action'. */
  actionType?: string;
  /** Tag every emitted node's metadata with these fields. */
  tags?: Record<string, unknown>;
}

function normalizeShot(
  s: Uint8Array | { data: Uint8Array; mime?: string },
): { data: Uint8Array; mime: string } {
  if (s instanceof Uint8Array) return { data: s, mime: 'image/png' };
  return { data: s.data, mime: s.mime ?? 'image/png' };
}

export function instrumentBrowserUse<T extends BrowserUseLike>(
  agent: T,
  run: RunClient,
  opts: InstrumentBrowserUseOptions = {},
): T {
  const actionType = opts.actionType ?? 'browser_action';
  const captureScreenshots =
    opts.captureScreenshots ?? (Boolean(opts.artifacts) && Boolean(agent.screenshot));

  const wrapStep = agent.step
    ? async (...args: unknown[]): Promise<BrowserStepResult | undefined> => {
        const start = Date.now();
        let result: BrowserStepResult | undefined;
        let error: unknown;
        try {
          result = await agent.step!(...args);
          return result;
        } catch (e) {
          error = e;
          throw e;
        } finally {
          const latencyMs = Date.now() - start;

          let attachment: ArtifactRef | undefined;
          if (captureScreenshots && opts.artifacts && agent.screenshot && !error) {
            try {
              const raw = await agent.screenshot();
              const { data, mime } = normalizeShot(raw);
              attachment = await opts.artifacts.upload({
                runId: run.runId,
                kind: 'screenshot',
                mime,
                data,
              });
            } catch {
              // Screenshot capture is best-effort; never fail the agent step.
            }
          }

          await run.step(
            actionType,
            {
              type: actionType,
              input: { action: result?.action, target: result?.target, args },
              output: result?.output,
              metadata: {
                browser: {
                  action: result?.action ?? 'unknown',
                  done: result?.done ?? false,
                  latency_ms: latencyMs,
                  status: error ? 'error' : 'success',
                },
                ...opts.tags,
              },
              custom_fields: attachment ? { attachments: [attachment] } : undefined,
            },
            async (s) => {
              if (error) {
                s.error =
                  error instanceof Error
                    ? { message: error.message, type: error.name }
                    : error;
              }
            },
          );
        }
      }
    : undefined;

  return new Proxy(agent, {
    get(target, prop, receiver) {
      if (prop === 'step' && wrapStep) return wrapStep;
      return Reflect.get(target, prop, receiver);
    },
  });
}
