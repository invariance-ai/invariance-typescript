import { Invariance } from '../index.js';
import { loadProfile } from './auth.js';
import { fail, type GlobalOpts } from './output.js';

export async function getClient(opts: GlobalOpts): Promise<Invariance> {
  const profile = await loadProfile({
    flagApiKey: opts.apiKey,
    flagApiUrl: opts.apiUrl,
    profile: opts.profile,
  });
  if (!profile.apiKey) {
    fail(
      'No API key found. Set --api-key, INVARIANCE_API_KEY, or run `invariance auth login`.',
      3,
    );
  }
  return Invariance.init({
    apiKey: profile.apiKey,
    apiUrl: profile.apiUrl,
    signingKey: profile.signingKey,
  });
}

export async function loadResolved(opts: GlobalOpts) {
  return loadProfile({
    flagApiKey: opts.apiKey,
    flagApiUrl: opts.apiUrl,
    profile: opts.profile,
  });
}
