#!/usr/bin/env node
/**
 * md2nativedocx MCP server over stdio.
 *
 * Environment: MD2NATIVEDOCX_MCP_ROOT (directory `convert_document` writes into; default: the current
 * directory), MD2NATIVEDOCX_MCP_RENDER_TIMEOUT_MS, MD2NATIVEDOCX_MCP_CONVERT_TIMEOUT_MS.
 * stdout belongs to the protocol: diagnostics go to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DEFAULT_CONVERT_TIMEOUT_MS, DEFAULT_RENDER_TIMEOUT_MS, createServer } from '../src/server.mjs';

function positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    process.stderr.write(`${name} must be a positive integer, got "${raw}"\n`);
    process.exit(2);
  }
  return n;
}

const server = createServer({
  root: process.env.MD2NATIVEDOCX_MCP_ROOT || process.cwd(),
  renderTimeoutMs: positiveInt('MD2NATIVEDOCX_MCP_RENDER_TIMEOUT_MS', DEFAULT_RENDER_TIMEOUT_MS),
  convertTimeoutMs: positiveInt('MD2NATIVEDOCX_MCP_CONVERT_TIMEOUT_MS', DEFAULT_CONVERT_TIMEOUT_MS),
});
await server.connect(new StdioServerTransport());
