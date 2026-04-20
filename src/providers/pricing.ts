/**
 * Best-effort LLM pricing. USD per 1K tokens. Users can override via
 * `registerPricing` or the `INVARIANCE_PRICING_OVERRIDE` env var (path to JSON).
 * Unknown models price to 0 — the caller is responsible for noticing.
 */

export interface PricingEntry {
  inputPer1k: number;
  outputPer1k: number;
  cacheReadPer1k?: number;
  cacheWritePer1k?: number;
}

const BUILTIN: Record<string, PricingEntry> = {
  'gpt-4o':            { inputPer1k: 0.0025, outputPer1k: 0.010 },
  'gpt-4o-mini':       { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'gpt-4-turbo':       { inputPer1k: 0.010, outputPer1k: 0.030 },
  'gpt-3.5-turbo':     { inputPer1k: 0.0005, outputPer1k: 0.0015 },
  'o1':                { inputPer1k: 0.015, outputPer1k: 0.060 },
  'o1-mini':           { inputPer1k: 0.003, outputPer1k: 0.012 },
  'claude-opus-4-7':   { inputPer1k: 0.015, outputPer1k: 0.075, cacheReadPer1k: 0.0015, cacheWritePer1k: 0.01875 },
  'claude-sonnet-4-6': { inputPer1k: 0.003, outputPer1k: 0.015, cacheReadPer1k: 0.0003, cacheWritePer1k: 0.00375 },
  'claude-haiku-4-5':  { inputPer1k: 0.0008, outputPer1k: 0.004, cacheReadPer1k: 0.00008, cacheWritePer1k: 0.001 },
  'claude-3-5-sonnet': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-5-haiku':  { inputPer1k: 0.0008, outputPer1k: 0.004 },
  'gemini-2.0-flash':  { inputPer1k: 0.000075, outputPer1k: 0.0003 },
  'gemini-1.5-pro':    { inputPer1k: 0.00125, outputPer1k: 0.005 },
};

const OVERRIDES: Record<string, PricingEntry> = {};

function loadOverrides(): void {
  const path = process.env?.INVARIANCE_PRICING_OVERRIDE;
  if (!path) return;
  try {
    // Dynamic require avoids a hard dep on fs for bundled browser builds.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs');
    const raw = JSON.parse(fs.readFileSync(path, 'utf-8'));
    for (const [model, entry] of Object.entries(raw)) {
      const e = entry as Partial<PricingEntry>;
      OVERRIDES[model] = {
        inputPer1k: Number(e.inputPer1k ?? 0),
        outputPer1k: Number(e.outputPer1k ?? 0),
        cacheReadPer1k: Number(e.cacheReadPer1k ?? 0),
        cacheWritePer1k: Number(e.cacheWritePer1k ?? 0),
      };
    }
  } catch {
    // Pricing is non-critical — swallow bad overrides silently.
  }
}

loadOverrides();

export function registerPricing(model: string, entry: PricingEntry): void {
  OVERRIDES[model] = entry;
}

function lookup(model: string): PricingEntry | undefined {
  if (OVERRIDES[model]) return OVERRIDES[model];
  if (BUILTIN[model]) return BUILTIN[model];
  for (const prefix of Object.keys(BUILTIN)) {
    if (model.startsWith(`${prefix}-`) || model.startsWith(`${prefix}:`)) return BUILTIN[prefix];
  }
  return undefined;
}

export interface PriceArgs {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function priceCall(args: PriceArgs): number {
  const entry = lookup(args.model);
  if (!entry) return 0;
  const r = (t: number, p: number | undefined) => (t * (p ?? 0)) / 1000;
  return Number(
    (
      r(args.inputTokens, entry.inputPer1k) +
      r(args.outputTokens, entry.outputPer1k) +
      r(args.cacheReadTokens ?? 0, entry.cacheReadPer1k) +
      r(args.cacheWriteTokens ?? 0, entry.cacheWritePer1k)
    ).toFixed(6),
  );
}
