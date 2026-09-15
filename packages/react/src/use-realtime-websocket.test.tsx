import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTransition, StrictMode, Suspense, useLayoutEffect } from 'react';
import {
  FakeAudioContext,
  FakeWebSocket,
  installLiveWebSocket,
} from '../../ai/src/realtime/__fixtures__/fake-live-websocket';
import {
  flushEvents,
  liveModel,
} from '../../ai/src/realtime/__fixtures__/fake-realtime';
import type { Experimental_UseRealtimeReturn } from './use-realtime';

vi.mock('ai', async () => import('../../ai/src/realtime'));
const { experimental_useRealtime } = await import('./use-realtime');
const { Experimental_AbstractRealtimeSession } = await import('ai');

async function openSession(socket: FakeWebSocket) {
  socket.open();
  await flushEvents();
  socket.emit({
    type: 'session-started',
    sessionId: socket.url,
    delegationMode: 'client',
    raw: {},
  });
  await flushEvents();
}

function actions(rt: Experimental_UseRealtimeReturn) {
  return Object.fromEntries(
    Object.entries(rt).filter(([, value]) => typeof value === 'function'),
  );
}

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
        delegationMode: 'client',
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
    expect(result.current.session?.usage).toEqual({ seconds: 2 });
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

  it.each(['configuration and callbacks', 'callbacks only'])(
    'keeps the connected committed owner when a transition abandons %s',
    async change => {
      const model = liveModel();
      const dispose = vi.spyOn(
        Experimental_AbstractRealtimeSession.prototype,
        'dispose',
      );
      const onErrorA = vi.fn();
      const onErrorB = vi.fn();
      const onEventA = vi.fn(event => {
        if (event.type === 'session-usage') throw new Error('A callback');
      });
      const onEventB = vi.fn();
      const renderedB = vi.fn();
      const pending = new Promise<never>(() => {});
      let committed: Experimental_UseRealtimeReturn;
      function Conversation({ version }: { version: 'A' | 'B' }) {
        const rt = experimental_useRealtime({
          model,
          api: {
            websocket:
              version === 'B' && change === 'configuration and callbacks'
                ? 'wss://app.example/B'
                : 'wss://app.example/A',
          },
          onEvent: version === 'A' ? onEventA : onEventB,
          onError: version === 'A' ? onErrorA : onErrorB,
        });
        useLayoutEffect(() => {
          committed = rt;
        });
        if (version === 'B') {
          renderedB();
          throw pending;
        }
        return <p>{rt.status}</p>;
      }
      const view = (version: 'A' | 'B') => (
        <Suspense fallback={<p>Pending</p>}>
          <Conversation version={version} />
        </Suspense>
      );
      const { rerender } = render(view('A'));
      await act(async () => {
        await committed.connect();
        await openSession(FakeWebSocket.instances[0]);
      });
      const socket = FakeWebSocket.instances[0];
      const audioContexts = [...FakeAudioContext.instances];
      await act(async () => {
        startTransition(() => rerender(view('B')));
      });
      expect(renderedB).toHaveBeenCalled();
      expect(screen.getByText('connected')).toBeTruthy();
      await act(async () => {
        socket.emit({ type: 'session-usage', usage: { seconds: 3 }, raw: {} });
        await flushEvents();
      });
      expect(onEventA).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'session-usage' }),
      );
      expect(onErrorA).toHaveBeenCalledWith(new Error('A callback'));
      expect(onEventB).not.toHaveBeenCalled();
      expect(onErrorB).not.toHaveBeenCalled();
      rerender(view('A'));
      expect(screen.getByText('connected')).toBeTruthy();
      expect(committed!.session?.usage).toEqual({ seconds: 3 });
      expect(FakeWebSocket.instances).toEqual([socket]);
      expect(FakeAudioContext.instances).toEqual(audioContexts);
      expect(socket.close).not.toHaveBeenCalled();
      expect(dispose).not.toHaveBeenCalled();
    },
  );

  it('routes retained actions to the committed replacement and revokes them on unmount', async () => {
    const model = liveModel();
    const { result, rerender, unmount } = renderHook(
      ({ endpoint }) =>
        experimental_useRealtime({ model, api: { websocket: endpoint } }),
      { initialProps: { endpoint: 'wss://app.example/A' } },
    );
    const retained = result.current;
    await act(async () => {
      await retained.connect();
      await openSession(FakeWebSocket.instances[0]);
    });
    expect(actions(result.current)).toEqual(actions(retained));
    rerender({ endpoint: 'wss://app.example/B' });
    expect(result.current.status).toBe('disconnected');
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
    expect(actions(result.current)).toEqual(actions(retained));
    await act(async () => {
      await retained.connect({ capture: false });
      await openSession(FakeWebSocket.instances[1]);
      await retained.sendEvent({
        type: 'context-append',
        delegationId: null,
        content: 'Current application context',
      });
    });
    expect(FakeWebSocket.instances[1].url).toBe('wss://app.example/B');
    expect(FakeWebSocket.instances[1].sent).toContainEqual(
      expect.objectContaining({ type: 'context-append' }),
    );
    expect(FakeWebSocket.instances[0].sent).not.toContainEqual(
      expect.objectContaining({ type: 'context-append' }),
    );
    expect(actions(result.current)).toEqual(actions(retained));
    unmount();
    await expect(retained.connect()).rejects.toThrow('mounted hook');
    await expect(retained.close()).rejects.toThrow('mounted hook');
    await expect(retained.resumeAudioCapture()).rejects.toThrow('mounted hook');
    await expect(retained.resumePlayback()).rejects.toThrow('mounted hook');
    const synchronous = [
      () => retained.sendEvent({ type: 'input-audio-mute' }),
      () => retained.sendTextMessage('hello'),
      () => retained.addToolOutput('call', 'result'),
      () => retained.sendAudio(''),
      () => retained.startAudioCapture({} as MediaStream),
      retained.disconnect,
      retained.commitAudio,
      retained.clearAudioBuffer,
      retained.requestResponse,
      retained.cancelResponse,
      retained.stopAudioCapture,
      retained.stopPlayback,
    ];
    for (const action of synchronous) expect(action).toThrow('mounted hook');
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1].close).toHaveBeenCalledOnce();
    expect(
      FakeAudioContext.instances.every(ctx => ctx.state === 'closed'),
    ).toBe(true);
  });

  it('publishes callback-only updates without reconnecting or changing actions', async () => {
    const model = liveModel();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onEvent }) =>
        experimental_useRealtime({
          model,
          api: { websocket: 'wss://app.example/live' },
          onEvent,
        }),
      { initialProps: { onEvent: first } },
    );
    const initialActions = actions(result.current);
    await act(async () => {
      await result.current.connect();
      await openSession(FakeWebSocket.instances[0]);
    });
    first.mockClear();
    rerender({ onEvent: second });
    await act(async () => {
      FakeWebSocket.instances[0].emit({
        type: 'session-usage',
        usage: { seconds: 5 },
        raw: {},
      });
      await flushEvents();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(result.current.session?.usage).toEqual({ seconds: 5 });
    expect(actions(result.current)).toEqual(initialActions);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].close).not.toHaveBeenCalled();
  });

  it('preserves asynchronous callback error handling without breaking the session', async () => {
    const model = liveModel();
    const onError = vi.fn(async () => {
      throw new Error('Error handler rejected');
    });
    const { result } = renderHook(() =>
      experimental_useRealtime({
        model,
        api: { websocket: 'wss://app.example/live' },
        onEvent: async event => {
          if (event.type === 'session-usage')
            throw new Error('Event handler rejected');
        },
        onError,
      }),
    );
    await act(async () => {
      await result.current.connect({ capture: false });
      await openSession(FakeWebSocket.instances[0]);
      FakeWebSocket.instances[0].emit({
        type: 'session-usage',
        usage: { seconds: 1 },
        raw: {},
      });
      await flushEvents();
    });
    expect(onError).toHaveBeenCalledWith(new Error('Event handler rejected'));
    expect(result.current.status).toBe('connected');
    expect(result.current.session?.usage).toEqual({ seconds: 1 });
  });

  it('runs legacy frontend tools with committed callbacks during and after a suspended update', async () => {
    const model: ReturnType<typeof liveModel> = {
      ...liveModel(),
      capabilities: {
        conversation: 'turn-based',
        transports: ['websocket'],
        connections: ['server-websocket'],
      },
    };
    const first = vi.fn(() => 'first result');
    const second = vi.fn(() => 'second result');
    const pending = new Promise<never>(() => {});
    const suspended = vi.fn();
    const { result, rerender } = renderHook(
      ({ onToolCall, suspend }) => {
        const rt = experimental_useRealtime({
          model,
          api: { websocket: 'wss://app.example/turns' },
          onToolCall,
        });
        if (suspend) {
          suspended();
          throw pending;
        }
        return rt;
      },
      {
        initialProps: { onToolCall: first, suspend: false },
        wrapper: ({ children }) => (
          <Suspense fallback={null}>{children}</Suspense>
        ),
      },
    );
    await act(async () => {
      await result.current.connect();
      FakeWebSocket.instances[0].open();
      await flushEvents();
      FakeWebSocket.instances[0].emit({ type: 'session-updated', raw: {} });
      await flushEvents();
    });
    await act(async () => {
      startTransition(() => rerender({ onToolCall: second, suspend: true }));
    });
    expect(suspended).toHaveBeenCalled();
    const socket = FakeWebSocket.instances[0];
    const callTool = async (callId: string) => {
      socket.emit({
        type: 'function-call-arguments-done',
        name: 'getWeather',
        callId,
        itemId: callId,
        responseId: callId,
        arguments: '{"city":"London"}',
        raw: {},
      });
      await flushEvents();
    };
    await act(async () => {
      await callTool('first');
    });
    expect(first).toHaveBeenCalledWith({
      toolCall: {
        toolCallId: 'first',
        toolName: 'getWeather',
        args: { city: 'London' },
      },
    });
    expect(second).not.toHaveBeenCalled();
    expect(socket.sent).toContainEqual(
      expect.objectContaining({
        type: 'conversation-item-create',
        item: expect.objectContaining({
          type: 'function-call-output',
          callId: 'first',
          output: '"first result"',
        }),
      }),
    );
    rerender({ onToolCall: second, suspend: false });
    await act(async () => {
      await callTool('second');
    });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(socket.sent).toContainEqual(
      expect.objectContaining({
        type: 'conversation-item-create',
        item: expect.objectContaining({
          type: 'function-call-output',
          callId: 'second',
          output: '"second result"',
        }),
      }),
    );
    expect(result.current.status).toBe('connected');
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('reuses the committed store through StrictMode effect cleanup and setup', async () => {
    const model = liveModel();
    function Conversation() {
      const rt = experimental_useRealtime({
        model,
        api: { websocket: 'wss://app.example/live' },
      });
      useLayoutEffect(() => {
        void rt.connect({ capture: false });
      }, [rt.connect]);
      return <p>{rt.status}</p>;
    }
    const { unmount } = render(
      <StrictMode>
        <Conversation />
      </StrictMode>,
    );
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
    await act(async () => {
      await openSession(FakeWebSocket.instances[1]);
    });
    expect(screen.getByText('connected')).toBeTruthy();
    unmount();
    expect(FakeWebSocket.instances[1].close).toHaveBeenCalledOnce();
  });

  it('replaces a model with the same ID when its options identity changes', async () => {
    const first = liveModel();
    const second = liveModel();
    const { result, rerender } = renderHook(
      ({ model }) =>
        experimental_useRealtime({
          model,
          api: { websocket: 'wss://app.example/live' },
        }),
      { initialProps: { model: first } },
    );
    await act(async () => {
      await result.current.connect({ capture: false });
      await openSession(FakeWebSocket.instances[0]);
    });
    rerender({ model: second });
    expect(result.current.status).toBe('disconnected');
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
  });
});
