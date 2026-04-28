#!/usr/bin/env node

/**
 * Stdio MCP entry point for Agent Cortex.
 * Each invocation spawns a new process — use serve.ts for shared HTTP mode.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, checkEnvVars } from './server.js';

async function main() {
  checkEnvVars();

  const server = createServer();
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
  console.error('Agent Cortex MCP server started (stdio)');
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
