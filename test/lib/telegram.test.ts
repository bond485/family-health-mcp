import { describe, expect, it, vi } from 'vitest';
import {
  resolveTelegramChatIds,
  sendTelegramBroadcast,
  sendTelegramMessage,
} from '../../src/lib/telegram';

describe('sendTelegramMessage', () => {
  it('sends plain text to the configured Telegram chat', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.telegram.org/bottest-token/sendMessage');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        chat_id: '123456789',
        text: 'Health alert test',
        link_preview_options: { is_disabled: true },
      });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(
      sendTelegramMessage(
        'test-token',
        '123456789',
        '  Health alert test  ',
        fetchMock as typeof fetch,
      ),
    ).resolves.toEqual({ messageId: 42 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not expose the bot token when Telegram rejects a request', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: false, description: 'secret-token' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(
      sendTelegramMessage(
        'secret-token',
        '123456789',
        'Health alert test',
        fetchMock as typeof fetch,
      ),
    ).rejects.toThrow('Telegram API rejected the message (HTTP 401)');
  });

  it('rejects empty and oversized messages before making a request', async () => {
    const fetchMock = vi.fn();

    await expect(
      sendTelegramMessage('test-token', '123456789', '   ', fetchMock as typeof fetch),
    ).rejects.toThrow('Telegram message cannot be empty');
    await expect(
      sendTelegramMessage('test-token', '123456789', 'x'.repeat(4097), fetchMock as typeof fetch),
    ).rejects.toThrow('Telegram message exceeds the 4096-character limit');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('resolveTelegramChatIds', () => {
  it('uses, trims, and deduplicates the configured family recipients', () => {
    expect(resolveTelegramChatIds('123, 456,123', '999')).toEqual(['123', '456']);
  });

  it('falls back to the original single recipient', () => {
    expect(resolveTelegramChatIds(undefined, '123')).toEqual(['123']);
  });

  it('rejects invalid recipient configuration', () => {
    expect(() => resolveTelegramChatIds('123,not-a-chat', '999')).toThrow(
      'Telegram recipient configuration is invalid',
    );
  });
});

describe('sendTelegramBroadcast', () => {
  it('sends the same message to every configured recipient', async () => {
    const recipients: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      recipients.push(body.chat_id);
      return new Response(JSON.stringify({ ok: true, result: { message_id: recipients.length } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(
      sendTelegramBroadcast(
        'test-token',
        ['123', '456'],
        'Family health summary',
        fetchMock as typeof fetch,
      ),
    ).resolves.toEqual({ messageIds: [1, 2] });
    expect(recipients).toEqual(['123', '456']);
  });
});
