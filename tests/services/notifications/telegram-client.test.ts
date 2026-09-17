import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TelegramBotClient, fetchRecentChatIds } from "../../../src/services/notifications/telegram-client.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("TelegramBotClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends chat_id and text to the sendMessage endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new TelegramBotClient("token123", "chat456");

    await client.sendMessage("hello");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottoken123/sendMessage");
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: "chat456", text: "hello" });
  });

  it("truncates messages over the 4096-character limit", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const client = new TelegramBotClient("token", "chat");
    const longText = "x".repeat(5000);

    await client.sendMessage(longText);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentText = (JSON.parse(init.body as string) as { text: string }).text;
    expect(sentText.length).toBe(4096);
    expect(sentText.endsWith("…")).toBe(true);
  });

  it("honors retry_after on a 429 and retries once", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: false, error_code: 429, parameters: { retry_after: 2 } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new TelegramBotClient("token", "chat");

    const promise = client.sendMessage("hi");
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throws after a failed retry", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () =>
      jsonResponse({ ok: false, error_code: 429, description: "still limited", parameters: { retry_after: 1 } }),
    );
    const client = new TelegramBotClient("token", "chat");

    const promise = client.sendMessage("hi").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await promise;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("still limited");
    vi.useRealTimers();
  });

  it("throws on a non-rate-limit failure without retrying", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, description: "Forbidden: bot was blocked by the user" }));
    const client = new TelegramBotClient("token", "chat");

    await expect(client.sendMessage("hi")).rejects.toThrow("bot was blocked by the user");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fetchRecentChatIds", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts and dedupes chat ids from getUpdates results", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        result: [{ message: { chat: { id: 111 } } }, { message: { chat: { id: 111 } } }, { message: { chat: { id: 222 } } }],
      }),
    );

    const ids = await fetchRecentChatIds("token");
    expect(ids.sort()).toEqual([111, 222]);
  });

  it("returns an empty array when there are no updates yet", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    expect(await fetchRecentChatIds("token")).toEqual([]);
  });

  it("throws with Telegram's description on failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, description: "Unauthorized" }));
    await expect(fetchRecentChatIds("bad-token")).rejects.toThrow("Unauthorized");
  });
});
