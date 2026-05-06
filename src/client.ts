export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id?: string;
  };
}

export class InvarianceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'InvarianceApiError';
  }
}

/** Raised when the server returned 429 and retries are exhausted. */
export class RateLimitError extends InvarianceApiError {
  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(status, code, message, details, requestId);
    this.name = 'RateLimitError';
  }
}

export interface RetryPolicy {
  maxRetries: number;
  baseSeconds: number;
  factor: number;
  maxSeconds: number;
  /** ± fraction of the computed delay. */
  jitter: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseSeconds: 0.5,
  factor: 2,
  maxSeconds: 30,
  jitter: 0.25,
};

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function backoffDelay(policy: RetryPolicy, attempt: number, retryAfter: number | null): number {
  if (retryAfter !== null) return Math.min(retryAfter, policy.maxSeconds);
  const base = Math.min(policy.maxSeconds, policy.baseSeconds * policy.factor ** (attempt - 1));
  const jitterRange = base * policy.jitter;
  const delta = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, base + delta);
}

function sleep(seconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.ceil(seconds * 1000));
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface HttpClientOptions {
  retryPolicy?: Partial<RetryPolicy>;
  signal?: AbortSignal;
}

export class HttpClient {
  private readonly retry: RetryPolicy;
  private readonly signal?: AbortSignal;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    options: HttpClientOptions = {},
  ) {
    // Defense-in-depth: callers normally pass a value already normalized by
    // resolveConfig(), but if HttpClient is constructed directly, strip
    // trailing slashes here so `${this.baseUrl}/v1/foo` never becomes
    // `https://x//v1/foo`.
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.retry = { ...DEFAULT_RETRY_POLICY, ...options.retryPolicy };
    this.signal = options.signal;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res!: Response;
    let lastStatus = 0;
    for (let attempt = 0; attempt <= this.retry.maxRetries; attempt++) {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: this.signal,
      });
      if (res.ok || !shouldRetry(res.status)) break;
      lastStatus = res.status;
      if (attempt >= this.retry.maxRetries) break;
      const retryAfter = parseRetryAfter(res.headers.get('Retry-After'));
      await sleep(backoffDelay(this.retry, attempt + 1, retryAfter), this.signal);
    }

    if (!res.ok) {
      let parsed: ApiErrorBody | undefined;
      try {
        parsed = (await res.json()) as ApiErrorBody;
      } catch {
        // Error response body isn't JSON — fall through with `unknown` defaults.
      }
      const ErrCls = lastStatus === 429 ? RateLimitError : InvarianceApiError;
      throw new ErrCls(
        res.status,
        parsed?.error?.code ?? 'unknown',
        parsed?.error?.message ?? `HTTP ${res.status}`,
        parsed?.error?.details,
        parsed?.error?.request_id,
      );
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
