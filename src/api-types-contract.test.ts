/**
 * api-types contract test (TS-002).
 *
 * Enforces structural equivalence between SDK-local types and
 * `@invariance/api-types`. Catches platform-side schema drift in CI
 * instead of at runtime.
 *
 * Currently todo: requires `@invariance/api-types` to be installable as
 * a workspace dep here. Once it is, replace each `it.todo` with an
 * `expectTypeOf<SdkX>().toMatchTypeOf<PlatformX>()` assertion.
 */
import { describe, it } from 'vitest';

describe('api-types contract: SDK shapes match @invariance/api-types', () => {
  it.todo('SDK Signal is assignable to platform Signal');
  it.todo('SDK Finding is assignable to platform Finding');
  it.todo('SDK Review is assignable to platform Review');
  it.todo('SDK Monitor is assignable to platform Monitor');
  it.todo('SDK Run is assignable to platform Run');
  it.todo('SDK Node payload matches platform Node');
  it.todo('SDK RunProof.reason matches platform RunProofReason union exactly');
});
