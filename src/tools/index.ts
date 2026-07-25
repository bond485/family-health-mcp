import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Env } from '../env';
import type { HealthProvider } from '../providers/types';
import { registerCycleTools } from './cycle';
import { registerTelegramAlertTool } from './notify/telegram';
import { registerActivityReadTools } from './read/activity';
import { registerBodyReadTools } from './read/body';
import { registerDevicesTool } from './read/devices';
import { registerHeartReadTools } from './read/heart';
import { registerMetricsReadTools } from './read/metrics';
import { registerNutritionReadTools } from './read/nutrition';
import { registerProfileTool } from './read/profile';
import { registerSleepReadTools } from './read/sleep';

export function registerAllTools(server: McpServer, provider: HealthProvider, env: Env): void {
  registerProfileTool(server, provider, env);
  registerDevicesTool(server, provider, env);
  registerActivityReadTools(server, provider, env);
  registerHeartReadTools(server, provider, env);
  registerSleepReadTools(server, provider, env);
  registerBodyReadTools(server, provider, env);
  registerNutritionReadTools(server, provider, env);
  registerMetricsReadTools(server, provider, env);
  registerCycleTools(server, env);
  registerTelegramAlertTool(server, env);
}
