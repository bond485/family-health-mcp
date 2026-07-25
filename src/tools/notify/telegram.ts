import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../../env';
import { toolErrorResult } from '../../lib/errors';
import { sendTelegramMessage } from '../../lib/telegram';

export function registerTelegramAlertTool(server: McpServer, env: Env): void {
  server.registerTool(
    'send_telegram_alert',
    {
      title: 'Send Telegram health alert',
      description:
        'Sends a health alert or setup test to the single Telegram chat configured by the server owner. The recipient cannot be changed by the caller.',
      inputSchema: {
        message: z
          .string()
          .trim()
          .min(1)
          .max(4096)
          .describe(
            'Plain-text notification to send. Do not include raw medical records or secrets.',
          ),
      },
      outputSchema: {
        sent: z.boolean(),
        messageId: z.number().int(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ message }) => {
      try {
        const result = await sendTelegramMessage(
          env.TELEGRAM_BOT_TOKEN,
          env.TELEGRAM_CHAT_ID,
          message,
        );
        const data = { sent: true, messageId: result.messageId };
        return {
          structuredContent: data,
          content: [{ type: 'text', text: `Telegram alert sent (message ${result.messageId}).` }],
        };
      } catch (err) {
        return toolErrorResult(err);
      }
    },
  );
}
