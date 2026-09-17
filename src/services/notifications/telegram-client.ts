import { logger } from "../../shared/logger.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
// Confirmed against the live API docs (core.telegram.org/bots/api):
// "Text of the message to be sent, 1-4096 characters after entities parsing".
const MAX_MESSAGE_LENGTH = 4096;

// A thin interface between the notification services and the real
// Telegram API — lets tests substitute a fake client instead of hitting
// the network (same pattern as Phase 2's fetch-mocking, Phase 4's
// SheetsClient).
export interface TelegramClient {
  sendMessage(text: string): Promise<void>;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

export class TelegramBotClient implements TelegramClient {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  async sendMessage(text: string): Promise<void> {
    const body = text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : text;
    if (body.length !== text.length) {
      logger.warn("Telegram message truncated to fit the 4096-character limit", { originalLength: text.length });
    }

    const first = await this.post(body);
    if (first.ok) return;

    // Telegram's documented rate-limit response includes an exact
    // retry_after in seconds — honor it precisely rather than a generic
    // backoff, then retry once.
    if (first.parameters?.retry_after) {
      const retryAfterSeconds = first.parameters.retry_after;
      logger.warn("Telegram rate limit hit, retrying once", { retryAfterSeconds });
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
      const second = await this.post(body);
      if (second.ok) return;
      throw new Error(`Telegram sendMessage failed after retry: ${second.description ?? "unknown error"}`);
    }

    throw new Error(`Telegram sendMessage failed: ${first.description ?? "unknown error"}`);
  }

  private async post(text: string): Promise<TelegramApiResponse> {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: this.chatId, text }),
    });
    return (await response.json()) as TelegramApiResponse;
  }
}

// One-time setup helper (backs the get-telegram-chat-id CLI command): the
// only way to learn a Telegram user's chat_id is for them to message the
// bot first, then read it back off getUpdates.
export async function fetchRecentChatIds(botToken: string): Promise<number[]> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/getUpdates`);
  const data = (await response.json()) as {
    ok: boolean;
    description?: string;
    result?: Array<{ message?: { chat?: { id: number } } }>;
  };
  if (!data.ok) {
    throw new Error(`Telegram getUpdates failed: ${data.description ?? "unknown error"}`);
  }
  const ids = (data.result ?? [])
    .map((update) => update.message?.chat?.id)
    .filter((id): id is number => id !== undefined);
  return [...new Set(ids)];
}
