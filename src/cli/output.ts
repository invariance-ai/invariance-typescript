export type OutputFormat = 'json' | 'table' | 'yaml';

export interface GlobalOpts {
  apiKey?: string;
  apiUrl?: string;
  profile?: string;
  output?: OutputFormat;
  json?: boolean;
  quiet?: boolean;
  noColor?: boolean;
}

export function resolveFormat(opts: GlobalOpts): OutputFormat {
  if (opts.json) return 'json';
  if (opts.output) return opts.output;
  return process.stdout.isTTY ? 'table' : 'json';
}

export function print(data: unknown, opts: GlobalOpts, columns?: TableColumn[]): void {
  const fmt = resolveFormat(opts);
  if (fmt === 'json') {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  if (fmt === 'yaml') {
    process.stdout.write(toYaml(data) + '\n');
    return;
  }
  printTable(data, columns);
}

export interface TableColumn {
  header: string;
  get: (row: any) => unknown;
}

export function printTable(data: unknown, columns?: TableColumn[]): void {
  const rows = Array.isArray(data) ? data : isListResponse(data) ? data.data : [data];
  if (!rows.length) {
    process.stdout.write('(no results)\n');
    return;
  }
  const cols = columns ?? inferColumns(rows[0]);
  const values = rows.map((row) => cols.map((c) => formatCell(c.get(row))));
  const widths = cols.map((c, i) =>
    Math.max(c.header.length, ...values.map((v) => v[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i])).join('  ');
  process.stdout.write(line(cols.map((c) => c.header)) + '\n');
  process.stdout.write(widths.map((w) => '-'.repeat(w)).join('  ') + '\n');
  for (const v of values) process.stdout.write(line(v) + '\n');

  if (isListResponse(data) && data.next_cursor) {
    process.stdout.write(`\nnext_cursor: ${data.next_cursor}\n`);
  }
}

function isListResponse(x: unknown): x is { data: any[]; next_cursor: string | null } {
  return !!x && typeof x === 'object' && Array.isArray((x as any).data) && 'next_cursor' in (x as any);
}

function inferColumns(sample: unknown): TableColumn[] {
  if (!sample || typeof sample !== 'object') {
    return [{ header: 'value', get: (v) => v }];
  }
  const keys = Object.keys(sample as object).slice(0, 6);
  return keys.map((k) => ({ header: k, get: (row: any) => row[k] }));
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.length > 60 ? value.slice(0, 57) + '...' : value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((v) => `${pad}- ${toYaml(v, indent + 1).trimStart()}`).join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as object);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        const child = toYaml(v, indent + 1);
        if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length) {
          return `${pad}${k}:\n${child}`;
        }
        if (Array.isArray(v) && v.length) {
          return `${pad}${k}:\n${child}`;
        }
        return `${pad}${k}: ${child}`;
      })
      .join('\n');
  }
  return String(value);
}

export function parseJson(name: string, value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (err) {
    fail(`invalid JSON in --${name}: ${(err as Error).message}`, 1);
  }
}

export function fail(message: string, exitCode = 1): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(exitCode);
}

export function handleError(err: unknown): never {
  const e = err as any;
  if (e?.name === 'InvarianceApiError') {
    const rid = e.requestId ? ` (request_id=${e.requestId})` : '';
    process.stderr.write(`Error [${e.status} ${e.code}]: ${e.message}${rid}\n`);
    if (e.status === 401 || e.status === 403) {
      process.stderr.write('Hint: run `invariance auth login` to set credentials.\n');
      process.exit(3);
    }
    process.exit(1);
  }
  if (e?.code === 'ENOTFOUND' || e?.code === 'ECONNREFUSED') {
    process.stderr.write(`Network error: ${e.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`Error: ${e?.message ?? String(e)}\n`);
  process.exit(1);
}
