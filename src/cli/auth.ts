import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { DEFAULT_API_URL, type CredentialsFile, type StoredProfile } from '../config.js';

const CRED_DIR = join(homedir(), '.invariance');
const CRED_FILE = join(CRED_DIR, 'credentials.json');

async function readFile(): Promise<CredentialsFile> {
  try {
    const raw = await fs.readFile(CRED_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CredentialsFile>;
    return { default: parsed.default, profiles: parsed.profiles ?? {} };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { profiles: {} };
    }
    throw err;
  }
}

async function writeFile(data: CredentialsFile): Promise<void> {
  await fs.mkdir(dirname(CRED_FILE), { recursive: true, mode: 0o700 });
  await fs.writeFile(CRED_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export interface ResolvedProfile {
  apiKey: string;
  apiUrl: string;
  signingKey?: string;
  source: 'flag' | 'env' | 'file' | 'missing';
  profileName?: string;
}

export interface LoadOptions {
  flagApiKey?: string;
  flagApiUrl?: string;
  profile?: string;
}

export async function loadProfile(opts: LoadOptions = {}): Promise<ResolvedProfile> {
  if (opts.flagApiKey) {
    return {
      apiKey: opts.flagApiKey,
      apiUrl: opts.flagApiUrl ?? process.env.INVARIANCE_API_URL ?? DEFAULT_API_URL,
      source: 'flag',
    };
  }
  if (process.env.INVARIANCE_API_KEY) {
    return {
      apiKey: process.env.INVARIANCE_API_KEY,
      apiUrl: opts.flagApiUrl ?? process.env.INVARIANCE_API_URL ?? DEFAULT_API_URL,
      signingKey: process.env.INVARIANCE_SIGNING_KEY,
      source: 'env',
    };
  }
  const file = await readFile();
  const name = opts.profile ?? file.default ?? 'default';
  const profile = file.profiles[name];
  if (!profile) {
    return {
      apiKey: '',
      apiUrl: opts.flagApiUrl ?? DEFAULT_API_URL,
      source: 'missing',
      profileName: name,
    };
  }
  return {
    apiKey: profile.apiKey,
    apiUrl: opts.flagApiUrl ?? profile.apiUrl ?? DEFAULT_API_URL,
    signingKey: profile.signingKey,
    source: 'file',
    profileName: name,
  };
}

export async function saveProfile(name: string, profile: StoredProfile, makeDefault = true): Promise<void> {
  const file = await readFile();
  file.profiles[name] = profile;
  if (makeDefault || !file.default) file.default = name;
  await writeFile(file);
}

export async function removeProfile(name: string): Promise<boolean> {
  const file = await readFile();
  if (!(name in file.profiles)) return false;
  delete file.profiles[name];
  if (file.default === name) {
    const remaining = Object.keys(file.profiles);
    file.default = remaining.length ? remaining[0] : undefined;
  }
  await writeFile(file);
  return true;
}

export async function listProfiles(): Promise<{ default?: string; profiles: string[] }> {
  const file = await readFile();
  return { default: file.default, profiles: Object.keys(file.profiles) };
}

export function credentialsPath(): string {
  return CRED_FILE;
}

export async function promptSecret(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let input = '';
    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf8');
      for (const ch of str) {
        if (ch === '\n' || ch === '\r') {
          stdin.removeListener('data', onData);
          if (stdin.isTTY) stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(input);
          return;
        }
        if (ch === '\u0003') {
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          input = input.slice(0, -1);
        } else {
          input += ch;
        }
      }
    };
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
