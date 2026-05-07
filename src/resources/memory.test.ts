import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../client.js';
import { Invariance } from '../index.js';
import {
  buildMemoryReadBody,
  buildMemoryWriteBody,
  type MemoryAccess,
  type MemoryDivergenceKind,
  type MemoryRecord,
} from './memory.js';

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function stubbedInvariance(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });

  const http = (inv as unknown as { memory: { http: HttpClient } }).memory[
    'http' as never
  ] as unknown as HttpClient;

  const access: MemoryAccess = {
    id: 'mem_acc_1',
    run_id: 'run_1',
    node_id: 'node_1',
    agent_id: 'agent_1',
    access_type: 'read',
    subject_type: 'customer',
    subject_id: 'cust_42',
    key: 'preferred_contact_channel',
    value: 'email',
    used_for: 'select-channel',
    source_node_id: null,
    timestamp: '2026-05-07T12:00:00Z',
  };

  const record: MemoryRecord = {
    id: 'mem_1',
    agent_id: 'agent_1',
    subject_type: 'customer',
    subject_id: 'cust_42',
    claim: 'preferred_contact_channel',
    value: 'email',
    source: 'agent_write',
    confidence: 1.0,
    valid_from: '2026-05-07T12:00:00Z',
    valid_until: null,
    last_verified_at: null,
    superseded_by: null,
    provenance: [],
  };

  const respond = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (path === '/v1/memory/read') return { access, record };
    if (path === '/v1/memory/write') return { access: { ...access, access_type: 'write' }, record };
    return {};
  };

  http.post = ((path: string, body?: unknown) => respond('POST', path, body)) as HttpClient['post'];

  return { inv, calls };
}

describe('memory resource', () => {
  const prevRun = process.env.INVARIANCE_RUN_ID;
  const prevNode = process.env.INVARIANCE_NODE_ID;

  beforeEach(() => {
    delete process.env.INVARIANCE_RUN_ID;
    delete process.env.INVARIANCE_NODE_ID;
  });

  afterEach(() => {
    if (prevRun !== undefined) process.env.INVARIANCE_RUN_ID = prevRun;
    if (prevNode !== undefined) process.env.INVARIANCE_NODE_ID = prevNode;
  });

  it('inv.memory.read POSTs /v1/memory/read with the read body', async () => {
    const { inv, calls } = stubbedInvariance();
    const res = await inv.memory.read({
      run_id: 'run_1',
      node_id: 'node_1',
      subject_type: 'customer',
      subject_id: 'cust_42',
      key: 'preferred_contact_channel',
      used_for: 'select-channel',
    });
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/v1/memory/read',
        body: {
          run_id: 'run_1',
          node_id: 'node_1',
          subject_type: 'customer',
          subject_id: 'cust_42',
          key: 'preferred_contact_channel',
          used_for: 'select-channel',
        },
      },
    ]);
    expect(res.record?.id).toBe('mem_1');
    expect(res.access.access_type).toBe('read');
  });

  it('inv.memory.write defaults source=agent_write and confidence=1.0', async () => {
    const { inv, calls } = stubbedInvariance();
    await inv.memory.write({
      run_id: 'run_1',
      node_id: 'node_1',
      subject_type: 'customer',
      subject_id: 'cust_42',
      key: 'preferred_contact_channel',
      value: 'email',
      used_for: 'remember',
    });
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body.source).toBe('agent_write');
    expect(body.confidence).toBe(1.0);
    expect(body.value).toBe('email');
  });

  it('respects explicit source / confidence / provenance / valid_until', () => {
    const body = buildMemoryWriteBody({
      subject_type: 'policy',
      subject_id: 'pol_1',
      key: 'expiry',
      value: '2027-01-01',
      used_for: 'check',
      source: 'policy_doc',
      confidence: 0.7,
      provenance: [{ kind: 'document', id: 'doc_1' }],
      valid_until: '2027-01-01T00:00:00Z',
    });
    expect(body.source).toBe('policy_doc');
    expect(body.confidence).toBe(0.7);
    expect(body.provenance).toEqual([{ kind: 'document', id: 'doc_1' }]);
    expect(body.valid_until).toBe('2027-01-01T00:00:00Z');
  });

  it('auto-fills run_id / node_id from env vars when omitted', () => {
    process.env.INVARIANCE_RUN_ID = 'run_env';
    process.env.INVARIANCE_NODE_ID = 'node_env';
    const body = buildMemoryReadBody({
      subject_type: 'user',
      subject_id: 'u_1',
      key: 'k',
      used_for: 'x',
    });
    expect(body.run_id).toBe('run_env');
    expect(body.node_id).toBe('node_env');
  });

  it('omits run_id / node_id when neither input nor env set', () => {
    const body = buildMemoryReadBody({
      subject_type: 'user',
      subject_id: 'u_1',
      key: 'k',
      used_for: 'x',
    });
    expect('run_id' in body).toBe(false);
    expect('node_id' in body).toBe(false);
  });

  it('MemoryDivergenceKind enumerates all 7 kinds', () => {
    const kinds: MemoryDivergenceKind[] = [
      'stale_memory',
      'contradicted_memory',
      'unsupported_memory',
      'overgeneralized_memory',
      'memory_used_without_source',
      'memory_caused_bad_action',
      'memory_not_updated_after_ground_truth_change',
    ];
    expect(kinds).toHaveLength(7);
  });
});
