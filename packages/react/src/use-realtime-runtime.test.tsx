import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  liveModel,
  flushEvents,
} from '../../ai/src/realtime/__fixtures__/fake-realtime';
import {
  FakeWebSocket,
  installLiveWebSocket,
} from '../../ai/src/realtime/__fixtures__/fake-live-websocket';
import type { RealtimeSessionOptions } from '../../ai/src/realtime/realtime-session';

vi.mock('ai', async () => ({
  Experimental_AbstractRealtimeSession: (
    await import('../../ai/src/realtime/realtime-session')
  ).AbstractRealtimeSession,
}));

const { experimental_useRealtime } = await import('./use-realtime');

describe('legacy realtime hook WebSocket configuration keys', () => {
  beforeEach(() => {
    installLiveWebSocket();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const options = (): RealtimeSessionOptions => ({
    model: {
      ...liveModel(),
      capabilities: {
        conversation: 'turn-based',
        transports: ['websocket'],
        connections: ['server-websocket'],
      },
    },
    api: { websocket: 'wss://first.test', protocols: ['one', 'two'] },
  });

  it('keeps equal protocol values and replaces sockets for URL or protocol value changes', async () => {
    const initialProps = options();
    const { result, rerender } = renderHook(
      props => experimental_useRealtime(props),
      { initialProps },
    );
    await act(async () => {
      await result.current.connect();
    });
    const first = FakeWebSocket.instances[0];
    await act(async () => {
      first.open();
      first.emit({ type: 'session-created', sessionId: 'legacy', raw: {} });
      await flushEvents();
    });
    expect(result.current.status).toBe('connected');
    rerender({
      ...initialProps,
      api: { websocket: 'wss://first.test', protocols: ['one', 'two'] },
    });
    expect(first.close).not.toHaveBeenCalled();
    await act(async () => {
      result.current.sendTextMessage('legacy text');
      await flushEvents();
    });
    expect(first.sent.map(event => event.type)).toEqual([
      'session-update',
      'conversation-item-create',
      'response-create',
    ]);

    const nextProps = {
      ...initialProps,
      api: { websocket: 'wss://second.test', protocols: ['one', 'two'] },
    };
    rerender(nextProps);
    expect(first.close).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('disconnected');
    await act(async () => {
      await result.current.connect();
    });
    const second = FakeWebSocket.instances[1];
    expect(second.url).toBe('wss://second.test');
    expect(second.protocols).toEqual(['one', 'two']);

    rerender({
      ...nextProps,
      api: { websocket: 'wss://second.test', protocols: ['two', 'one'] },
    });
    expect(second.close).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.connect();
    });
    expect(FakeWebSocket.instances[2].protocols).toEqual(['two', 'one']);
  });

  it('detects protocol mutation using the saved value snapshot', async () => {
    const initialProps = options();
    const { result, rerender } = renderHook(
      props => experimental_useRealtime(props),
      { initialProps },
    );
    await act(async () => {
      await result.current.connect();
    });
    initialProps.api.protocols?.push('three');
    rerender(initialProps);
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.connect();
    });
    expect(FakeWebSocket.instances[1].protocols).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it.each(['startupTimeoutMs', 'closeTimeoutMs'] as const)(
    'replaces a legacy store when %s changes',
    async key => {
      const initialProps = options();
      const { result, rerender } = renderHook(
        props => experimental_useRealtime(props),
        { initialProps },
      );
      await act(async () => {
        await result.current.connect();
      });
      rerender({ ...initialProps, [key]: 1000 });
      expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
      expect(result.current.status).toBe('disconnected');
    },
  );

  it('replaces a continuous store when its playback budget changes', async () => {
    const initialProps = {
      ...options(),
      model: liveModel(),
      maxPlaybackBufferSeconds: 2,
    };
    const { result, rerender } = renderHook(
      props => experimental_useRealtime(props),
      { initialProps },
    );
    await act(async () => {
      await result.current.connect();
    });
    rerender({ ...initialProps, maxPlaybackBufferSeconds: 4 });
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('disconnected');
  });

  it('can reconnect the same legacy session after StrictMode cleanup and explicit disconnect', async () => {
    const initialProps = options();
    const { result } = renderHook(
      () => experimental_useRealtime(initialProps),
      {
        wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
      },
    );
    await act(async () => {
      await result.current.connect();
    });
    act(() => {
      result.current.disconnect();
    });
    await act(async () => {
      await result.current.connect();
    });
    const socket = FakeWebSocket.instances[1];
    await act(async () => {
      socket.open();
      socket.emit({ type: 'session-created', sessionId: 'reused', raw: {} });
      await flushEvents();
    });
    expect(result.current.status).toBe('connected');
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
    expect(socket.close).not.toHaveBeenCalled();
  });
});
