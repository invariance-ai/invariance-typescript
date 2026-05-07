import type { MemoryAccess, SystemRecord } from './memory.js';

/**
 * Run-level operational context: bag of metadata plus the memory trace and
 * authoritative system records that grounded an agent's decisions.
 *
 * `memory_reads` / `memory_writes` come from `inv.memory.read` / `inv.memory.write`.
 * `authoritative_records` are CRM/ticket/policy snapshots fetched at run time.
 */
export interface OperationalContext {
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  type?: string;
  memory_reads: MemoryAccess[];
  memory_writes: MemoryAccess[];
  authoritative_records: SystemRecord[];
}

/** Defaults the memory + record arrays so callers can spread partial input. */
export function emptyOperationalContext(): OperationalContext {
  return {
    memory_reads: [],
    memory_writes: [],
    authoritative_records: [],
  };
}
