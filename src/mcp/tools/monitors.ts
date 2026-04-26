import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Invariance } from '../../index.js';
import type { MonitorSpec, UpdateMonitorRequest, EvaluateMonitorRequest } from '../../resources/monitors.js';
import { jsonResult, parseJsonArg } from '../util.js';

export function registerMonitorTools(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_monitor_create',
    'Create a monitor from a MonitorSpec (JSON-encoded)',
    {
      spec: z.string().describe('MonitorSpec as a JSON string: { name, on, when, do, severity?, description? }'),
    },
    async ({ spec }) => {
      const parsed = parseJsonArg('spec', spec) as MonitorSpec;
      return jsonResult(await inv.monitors.create(parsed));
    },
  );

  server.tool(
    'invariance_monitor_list',
    'List monitors',
    {
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) => jsonResult(await inv.monitors.list({ cursor, limit })),
  );

  server.tool(
    'invariance_monitor_get',
    'Get a monitor by ID',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.monitors.get(id)),
  );

  server.tool(
    'invariance_monitor_update',
    'Update a monitor (JSON patch body)',
    {
      id: z.string(),
      patch: z.string().describe('UpdateMonitorRequest as a JSON object string'),
    },
    async ({ id, patch }) => {
      const body = parseJsonArg('patch', patch) as UpdateMonitorRequest;
      return jsonResult(await inv.monitors.update(id, body));
    },
  );

  server.tool(
    'invariance_monitor_pause',
    'Disable a monitor',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.monitors.pause(id)),
  );

  server.tool(
    'invariance_monitor_resume',
    'Re-enable a monitor',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.monitors.resume(id)),
  );

  server.tool(
    'invariance_monitor_evaluate',
    'Manually evaluate a monitor against an input payload',
    {
      id: z.string(),
      input: z.string().optional().describe('EvaluateMonitorRequest as a JSON object string'),
    },
    async ({ id, input }) => {
      const body = (parseJsonArg('input', input) as EvaluateMonitorRequest | undefined) ?? {};
      return jsonResult(await inv.monitors.evaluate(id, body));
    },
  );

  server.tool(
    'invariance_monitor_executions',
    'List executions for a monitor',
    {
      id: z.string(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ id, cursor, limit }) => jsonResult(await inv.monitors.executions(id, { cursor, limit })),
  );

  server.tool(
    'invariance_monitor_findings',
    'List findings produced by a monitor',
    {
      id: z.string(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ id, cursor, limit }) => jsonResult(await inv.monitors.findings(id, { cursor, limit })),
  );
}
