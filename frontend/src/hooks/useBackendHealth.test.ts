import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useBackendHealth } from "./useBackendHealth";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useBackendHealth", () => {
  it("starts with unknown status", () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ status: "healthy", service: "test", checks: {} }),
    });

    const { result } = renderHook(() => useBackendHealth(15000));
    expect(result.current.status).toBe("unknown");
  });

  it("updates to healthy after fetch", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "healthy",
          service: "test",
          checks: { database: { status: "ok" } },
        }),
    });

    const { result } = renderHook(() => useBackendHealth(15000));

    vi.useRealTimers();
    await waitFor(() => {
      expect(result.current.status).toBe("healthy");
    });
    expect(result.current.checks.database?.status).toBe("ok");
  });

  it("sets unreachable on network error", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useBackendHealth(15000));

    vi.useRealTimers();
    await waitFor(() => {
      expect(result.current.status).toBe("unreachable");
    });
  });

  it("sets degraded when vllm is down", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "degraded",
          service: "test",
          checks: {
            database: { status: "ok" },
            vllm: { status: "error", message: "unreachable" },
          },
        }),
    });

    const { result } = renderHook(() => useBackendHealth(15000));

    vi.useRealTimers();
    await waitFor(() => {
      expect(result.current.status).toBe("degraded");
    });
    expect(result.current.checks.vllm?.status).toBe("error");
  });
});
