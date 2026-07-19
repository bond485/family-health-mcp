import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Env } from './env';
import { GoogleHealthProvider } from './providers/google';
import { registerAllTools } from './tools';

export function buildServer(env: Env): McpServer {
  const server = new McpServer({
    name: 'fitbit-googlehealth-mcp',
    version: '0.1.0',
  });
  const provider = new GoogleHealthProvider(env);
  registerAllTools(server, provider, env);
  return server;
}
