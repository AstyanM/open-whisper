import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "./useWebSocket";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readyState = 1;
  close = vi.fn(() => {
    this.onclose?.();
  });
  send = vi.fn();

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  static readonly OPEN = 1;
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

describe("useWebSocket", () => {
  it("starts disconnected", () => {
    const { result } = renderHook(() =>
      useWebSocket("ws://test", vi.fn()),
    );
    expect(result.current.state).toBe("disconnected");
  });

  it("transitions to connecting then connected", () => {
    const { result } = renderHook(() =>
      useWebSocket("ws://test", vi.fn()),
    );

    act(() => result.current.connect());
    expect(result.current.state).toBe("connecting");

    act(() => MockWebSocket.instances[0].onopen?.());
    expect(result.current.state).toBe("connected");
  });

  it("forwards parsed JSON messages", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket("ws://test", onMessage),
    );

    act(() => result.current.connect());
    act(() => MockWebSocket.instances[0].onopen?.());
    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type: "test", value: 42 }),
      });
    });

    expect(onMessage).toHaveBeenCalledWith({ type: "test", value: 42 });
  });

  it("ignores non-JSON messages", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket("ws://test", onMessage),
    );

    act(() => result.current.connect());
    act(() => MockWebSocket.instances[0].onopen?.());
    act(() => {
      MockWebSocket.instances[0].onmessage?.({ data: "not-json" });
    });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("send delegates to WebSocket when connected", () => {
    const { result } = renderHook(() =>
      useWebSocket("ws://test", vi.fn()),
    );

    act(() => result.current.connect());
    act(() => MockWebSocket.instances[0].onopen?.());

    act(() => result.current.send({ type: "start" }));

    expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: "start" }),
    );
  });

  it("disconnect transitions to disconnected", () => {
    const { result } = renderHook(() =>
      useWebSocket("ws://test", vi.fn()),
    );

    act(() => result.current.connect());
    act(() => MockWebSocket.instances[0].onopen?.());
    expect(result.current.state).toBe("connected");

    act(() => result.current.disconnect());
    expect(result.current.state).toBe("disconnected");
  });
});
