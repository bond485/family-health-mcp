export type TelegramSendResult = {
  messageId: number;
};

export type TelegramBroadcastResult = {
  messageIds: number[];
};

type TelegramResponse = {
  ok?: boolean;
  result?: {
    message_id?: number;
  };
};

export function resolveTelegramChatIds(
  configuredChatIds: string | undefined,
  fallbackChatId: string,
): string[] {
  const source = configuredChatIds?.trim() || fallbackChatId.trim();
  const chatIds = [
    ...new Set(
      source
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  if (chatIds.length === 0) {
    throw new Error('Telegram notifications are not configured');
  }
  if (chatIds.some((chatId) => !/^-?\d+$/.test(chatId))) {
    throw new Error('Telegram recipient configuration is invalid');
  }

  return chatIds;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramSendResult> {
  const text = message.trim();
  if (!botToken || !chatId) {
    throw new Error('Telegram notifications are not configured');
  }
  if (!text) {
    throw new Error('Telegram message cannot be empty');
  }
  if (text.length > 4096) {
    throw new Error('Telegram message exceeds the 4096-character limit');
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
    }),
  });

  let payload: TelegramResponse;
  try {
    payload = (await response.json()) as TelegramResponse;
  } catch {
    throw new Error(`Telegram API returned an invalid response (HTTP ${response.status})`);
  }

  if (!response.ok || payload.ok !== true) {
    throw new Error(`Telegram API rejected the message (HTTP ${response.status})`);
  }

  const messageId = payload.result?.message_id;
  if (!Number.isInteger(messageId)) {
    throw new Error('Telegram API response did not include a message ID');
  }

  return { messageId: messageId as number };
}

export async function sendTelegramBroadcast(
  botToken: string,
  chatIds: string[],
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramBroadcastResult> {
  const results = await Promise.all(
    chatIds.map((chatId) => sendTelegramMessage(botToken, chatId, message, fetchImpl)),
  );
  return { messageIds: results.map((result) => result.messageId) };
}
