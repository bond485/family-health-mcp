import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from '../../env';
import { toolErrorResult } from '../../lib/errors';
import { resolveTelegramChatIds, sendTelegramBroadcast } from '../../lib/telegram';

export function registerTelegramAlertTool(server: McpServer, env: Env): void {
  server.registerTool(
    'send_telegram_alert',
    {
      title: 'Send Telegram health alert',
      description:
        'Sends a health alert, daily summary, or setup test to the fixed family Telegram chats configured by the server owner. Recipients cannot be changed by the caller.',
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
        recipientCount: z.number().int(),
        messageIds: z.array(z.number().int()),
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
        const chatIds = resolveTelegramChatIds(env.TELEGRAM_CHAT_IDS, env.TELEGRAM_CHAT_ID);
        const result = await sendTelegramBroadcast(env.TELEGRAM_BOT_TOKEN, chatIds, message);
        const data = {
          sent: true,
          recipientCount: result.messageIds.length,
          messageIds: result.messageIds,
        };
        return {
          structuredContent: data,
          content: [
            {
              type: 'text',
              text: `Telegram alert sent to ${result.messageIds.length} configured recipient(s).`,
            },
          ],
        };
      } catch (err) {
        return toolErrorResult(err);
      }
    },
  );
}
