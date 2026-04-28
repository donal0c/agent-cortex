#!/usr/bin/env node

/**
 * Streamable HTTP MCP server for Agent Cortex.
 *
 * Runs a single long-lived process that all MCP clients (Claude Code, Codex, etc.)
 * connect to over HTTP, eliminating per-session child process spawning.
 *
 * Usage:
 *   node dist/serve.js
 *   PORT=3100 node dist/serve.js
 *
 * Clients connect to: http://localhost:3100/mcp
 */

import { createServer as createHttpServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, checkEnvVars } from './server.js';

const PORT = parseInt(process.env.PORT || '3100', 10);

// Map of session ID -> { server, transport }
const sessions = new Map<string, {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}>();

const httpServer = createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  // Health check
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
    return;
  }

  // Only handle /mcp
  if (url.pathname !== '/mcp') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Check for existing session
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    // Existing session — delegate to its transport
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    return;
  }

  if (sessionId && !sessions.has(sessionId)) {
    // Stale session ID
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  // New session (no session ID header) — create server + transport
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { server, transport });
      console.error(`[agent-cortex] Session initialized: ${id} (active: ${sessions.size})`);
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
      console.error(`[agent-cortex] Session closed: ${id} (active: ${sessions.size})`);
    },
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
});

async function main() {
  checkEnvVars();

  httpServer.listen(PORT, '127.0.0.1', () => {
    console.error(`[agent-cortex] Streamable HTTP MCP server listening on http://127.0.0.1:${PORT}/mcp`);
    console.error(`[agent-cortex] Health check: http://127.0.0.1:${PORT}/health`);
  });

  const shutdown = async () => {
    console.error('[agent-cortex] Shutting down...');
    for (const [, { server }] of sessions) {
      await server.close();
    }
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
