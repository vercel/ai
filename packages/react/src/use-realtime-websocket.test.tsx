import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import {
  FakeWebSocket,
  installLiveWebSocket,
} from '../../ai/src/realtime/__fixtures__/fake-live-websocket';
import {
  flushEvents,
  liveModel,
} from '../../ai/src/realtime/__fixtures__/fake-webrtc';

vi.mock('ai', async () => import('../../ai/src/realtime'));
const { experimental_useRealtime } = await import('./use-realtime');

describe('useRealtime WebSocket relay configuration', () => {
  beforeEach(() => {
    installLiveWebSocket();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses value-stable protocol lists and reconnects only when relay configuration changes', async () => {
    const model = liveModel();
    const { result, rerender, unmount } = renderHook(
      ({ protocol }) =>
        experimental_useRealtime({
          model,
          api: { websocket: 'wss://app.example/live', protocols: [protocol] },
        }),
      { initialProps: { protocol: 'app-one' }, wrapper: StrictMode },
    );
    await act(async () => {
      await result.current.connect();
      FakeWebSocket.instances[0].open();
      await flushEvents();
      FakeWebSocket.instances[0].emit({
        type: 'session-started',
        sessionId: 'first',
        delegationMode: 'responses',
        raw: {},
      });
      await flushEvents();
    });
    rerender({ protocol: 'app-one' });
    await act(async () => {
      FakeWebSocket.instances[0].emit({
        type: 'session-usage',
        usage: { seconds: 2 },
        raw: {},
      });
      await flushEvents();
    });
    expect(result.current.live?.usage).toEqual({ seconds: 2 });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(result.current.status).toBe('connected');
    expect(FakeWebSocket.instances[0].close).not.toHaveBeenCalled();
    rerender({ protocol: 'app-two' });
    expect(result.current.status).toBe('disconnected');
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.connect();
    });
    expect(FakeWebSocket.instances[1].protocols).toEqual(['app-two']);
    unmount();
    expect(FakeWebSocket.instances[1].close).toHaveBeenCalledOnce();
  });
});
