import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchHealth, fetchSessions, fetchSession, deleteSession } from "./api";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchHealth", () => {
  it("returns health data on success", async () => {
    const mockData = {
      status: "healthy",
      service: "test",
      checks: { database: { status: "ok" } },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    const result = await fetchHealth();
    expect(result.status).toBe("healthy");
    expect(result.checks.database?.status).toBe("ok");
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchHealth()).rejects.toThrow("Backend unreachable");
  });

  it("throws on network error", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchHealth()).rejects.toThrow("Failed to fetch");
  });
});

describe("fetchSessions", () => {
  it("returns session list", async () => {
    const sessions = [{ id: 1, mode: "transcription" }];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessions }),
    });
    const result = await fetchSessions();
    expect(result).toEqual(sessions);
  });

  it("throws on failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchSessions()).rejects.toThrow("Failed to fetch sessions");
  });
});

describe("fetchSession", () => {
  it("returns session detail", async () => {
    const detail = {
      session: { id: 1 },
      segments: [],
      full_text: "hello",
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(detail),
    });
    const result = await fetchSession(1);
    expect(result.full_text).toBe("hello");
  });

  it("throws on 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchSession(999)).rejects.toThrow("Failed to fetch session");
  });
});

describe("deleteSession", () => {
  it("resolves on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    await expect(deleteSession(1)).resolves.toBeUndefined();
  });

  it("throws on failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(deleteSession(1)).rejects.toThrow(
      "Failed to delete session",
    );
  });
});
