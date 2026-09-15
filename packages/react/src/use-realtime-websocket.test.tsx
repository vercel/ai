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
  deferred,
  flushEvents,
  liveModel,
} from '../../ai/src/realtime/__fixtures__/fake-realtime';
import type { RealtimeSessionOptions } from '../../ai/src/realtime/realtime-session';
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
      {
        initialProps: { endpoint: 'wss://app.example/A' },
        wrapper: StrictMode,
      },
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

  it.each([false, true])(
    'preserves live resources through a committed urgent Suspense hide/reveal (StrictMode: %s)',
    async strict => {
      const { track, getUserMedia } = installLiveWebSocket();
      const model = liveModel();
      const dispose = vi.spyOn(
        Experimental_AbstractRealtimeSession.prototype,
        'dispose',
      );
      const layoutCleanup = vi.fn();
      const onEvent = vi.fn();
      const uncommittedEvent = vi.fn();
      const warnings = vi.spyOn(console, 'error');
      const pending = new Promise<never>(() => {});
      let committed: Experimental_UseRealtimeReturn;
      function Conversation({ suspend }: { suspend: boolean }) {
        const rt = experimental_useRealtime({
          model,
          api: { websocket: 'wss://app.example/live' },
          onEvent: suspend ? uncommittedEvent : onEvent,
        });
        useLayoutEffect(() => {
          committed = rt;
        });
        useLayoutEffect(() => layoutCleanup, []);
        if (suspend) throw pending;
        return <p data-testid="conversation">{rt.status}</p>;
      }
      const view = (suspend: boolean) => {
        const content = (
          <Suspense fallback={<p>Pending</p>}>
            <Conversation suspend={suspend} />
          </Suspense>
        );
        return strict ? <StrictMode>{content}</StrictMode> : content;
      };
      const { rerender, unmount } = render(view(false));
      const retained = committed!;
      await act(async () => {
        await retained.connect();
        await openSession(FakeWebSocket.instances[0]);
      });
      const socket = FakeWebSocket.instances[0];
      const contexts = [...FakeAudioContext.instances];
      expect(committed!.isCapturing).toBe(true);
      expect(getUserMedia).toHaveBeenCalledOnce();
      dispose.mockClear();
      layoutCleanup.mockClear();
      onEvent.mockClear();

      // No transition: the fallback commits and React disconnects layout effects.
      rerender(view(true));
      expect(screen.getByText('Pending')).toBeVisible();
      expect(screen.getByTestId('conversation')).not.toBeVisible();
      expect(layoutCleanup).toHaveBeenCalledOnce();
      expect(dispose).not.toHaveBeenCalled();
      expect(socket.close).not.toHaveBeenCalled();
      expect(track.stop).not.toHaveBeenCalled();
      expect(contexts.every(context => context.state === 'running')).toBe(true);
      await act(async () => {
        await expect(retained.connect()).rejects.toThrow('already active');
        await retained.sendEvent({
          type: 'context-append',
          delegationId: null,
          content: 'Still the committed session',
        });
        socket.emit({ type: 'session-usage', usage: { seconds: 7 }, raw: {} });
        await flushEvents();
      });
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'session-usage' }),
      );
      expect(uncommittedEvent).not.toHaveBeenCalled();
      expect(socket.sent).toContainEqual(
        expect.objectContaining({ type: 'context-append' }),
      );
      expect(FakeWebSocket.instances).toEqual([socket]);

      rerender(view(false));
      expect(screen.queryByText('Pending')).toBeNull();
      expect(screen.getByTestId('conversation')).toBeVisible();
      expect(committed!.status).toBe('connected');
      expect(committed!.session?.usage).toEqual({ seconds: 7 });
      expect(committed!.isCapturing).toBe(true);
      expect(actions(committed!)).toEqual(actions(retained));
      expect(FakeAudioContext.instances).toEqual(contexts);
      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(track.stop).not.toHaveBeenCalled();
      expect(socket.close).not.toHaveBeenCalled();
      expect(dispose).not.toHaveBeenCalled();

      rerender(view(true));
      unmount();
      expect(dispose).toHaveBeenCalledOnce();
      expect(socket.close).toHaveBeenCalledOnce();
      expect(track.stop).toHaveBeenCalledOnce();
      expect(contexts.every(context => context.state === 'closed')).toBe(true);
      await expect(retained.connect()).rejects.toThrow('mounted hook');
      expect(() => retained.sendEvent({ type: 'input-audio-mute' })).toThrow(
        'mounted hook',
      );
      expect(FakeWebSocket.instances).toEqual([socket]);
      expect(warnings).not.toHaveBeenCalled();
    },
  );

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

  it.each([false, true])(
    'lets child layout effects connect on mount and endpoint replacement (StrictMode: %s)',
    async strict => {
      const model = liveModel();
      const failed = vi.fn();
      const warnings = vi.spyOn(console, 'error');
      const dispose = vi.spyOn(
        Experimental_AbstractRealtimeSession.prototype,
        'dispose',
      );
      const starts: Promise<void>[] = [];
      const controls: Experimental_UseRealtimeReturn['connect'][] = [];
      function Child({
        connect,
        endpoint,
      }: {
        connect: Experimental_UseRealtimeReturn['connect'];
        endpoint: string;
      }) {
        useLayoutEffect(() => {
          controls.push(connect);
          starts.push(connect({ capture: false }).catch(failed));
        }, [connect, endpoint]);
        return null;
      }
      function Conversation({ endpoint }: { endpoint: string }) {
        const rt = experimental_useRealtime({
          model,
          api: { websocket: endpoint },
          onError: failed,
        });
        return (
          <>
            <Child connect={rt.connect} endpoint={endpoint} />
            <p>{rt.status}</p>
          </>
        );
      }
      const view = (endpoint: string) =>
        strict ? (
          <StrictMode>
            <Conversation endpoint={endpoint} />
          </StrictMode>
        ) : (
          <Conversation endpoint={endpoint} />
        );
      const { rerender, unmount } = render(view('wss://app.example/A'));
      await act(async () => {
        await Promise.all(starts);
      });
      expect(failed).not.toHaveBeenCalled();
      const initialCount = strict ? 2 : 1;
      expect(FakeWebSocket.instances).toHaveLength(initialCount);
      if (strict)
        expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
      const first = FakeWebSocket.instances[initialCount - 1];
      expect(first.url).toBe('wss://app.example/A');
      await act(async () => {
        await openSession(first);
      });
      expect(screen.getByText('connected')).toBeTruthy();

      dispose.mockClear();
      rerender(view('wss://app.example/B'));
      await act(async () => {
        await Promise.all(starts);
      });
      expect(failed).not.toHaveBeenCalled();
      expect(FakeWebSocket.instances).toHaveLength(initialCount + 1);
      expect(first.close).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledOnce();
      const second = FakeWebSocket.instances[initialCount];
      expect(second.url).toBe('wss://app.example/B');
      await act(async () => {
        await openSession(second);
      });
      expect(screen.getByText('connected')).toBeTruthy();
      expect(controls.every(connect => connect === controls[0])).toBe(true);
      expect(
        FakeWebSocket.instances.filter(socket => socket.readyState === 1),
      ).toEqual([second]);

      unmount();
      expect(second.close).toHaveBeenCalledOnce();
      await expect(controls[0]()).rejects.toThrow('mounted hook');
      expect(FakeWebSocket.instances).toHaveLength(initialCount + 1);
      expect(warnings).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'publishes optional tool-handler presence only at commit (initially present: %s)',
    async initiallyPresent => {
      const model: ReturnType<typeof liveModel> = {
        ...liveModel(),
        capabilities: {
          conversation: 'turn-based',
          transports: ['websocket'],
          connections: ['server-websocket'],
        },
      };
      const handler = vi.fn(() => undefined);
      const onError = vi.fn();
      const connect = vi.spyOn(
        Experimental_AbstractRealtimeSession.prototype,
        'connect',
      );
      const pending = new Promise<never>(() => {});
      const suspended = vi.fn();
      const { result, rerender } = renderHook(
        ({
          onToolCall,
          suspend,
        }: {
          onToolCall: RealtimeSessionOptions['onToolCall'];
          suspend: boolean;
        }) => {
          const rt = experimental_useRealtime({
            model,
            api: { websocket: 'wss://app.example/turns' },
            onToolCall,
            onError,
          });
          if (suspend) {
            suspended();
            throw pending;
          }
          return rt;
        },
        {
          initialProps: {
            onToolCall: initiallyPresent ? handler : undefined,
            suspend: false,
          },
          wrapper: ({ children }) => (
            <Suspense fallback={null}>{children}</Suspense>
          ),
        },
      );
      await act(async () => {
        await result.current.connect();
        FakeWebSocket.instances[0].open();
        FakeWebSocket.instances[0].emit({ type: 'session-updated', raw: {} });
        await flushEvents();
      });
      const store = connect.mock.contexts[0] as InstanceType<
        typeof Experimental_AbstractRealtimeSession
      >;
      expect(store.onToolCall).toEqual(
        initiallyPresent ? expect.any(Function) : undefined,
      );
      const nextHandler = initiallyPresent ? undefined : handler;
      await act(async () => {
        startTransition(() =>
          rerender({ onToolCall: nextHandler, suspend: true }),
        );
      });
      expect(suspended).toHaveBeenCalled();
      expect(store.onToolCall).toEqual(
        initiallyPresent ? expect.any(Function) : undefined,
      );
      const socket = FakeWebSocket.instances[0];
      const callTool = async (callId: string) => {
        socket.emit({
          type: 'function-call-arguments-done',
          name: 'getWeather',
          callId,
          itemId: callId,
          responseId: callId,
          arguments: '{}',
          raw: {},
        });
        await flushEvents();
      };
      await act(async () => {
        await callTool('before');
      });
      expect(handler).toHaveBeenCalledTimes(initiallyPresent ? 1 : 0);
      expect(onError).toHaveBeenCalledTimes(initiallyPresent ? 0 : 1);
      if (!initiallyPresent)
        expect(onError).toHaveBeenCalledWith(
          new Error('No handler provided for tool "getWeather"'),
        );
      handler.mockClear();
      onError.mockClear();
      rerender({ onToolCall: nextHandler, suspend: false });
      expect(store.onToolCall).toEqual(
        initiallyPresent ? undefined : expect.any(Function),
      );
      await act(async () => {
        await callTool('after');
      });
      expect(handler).toHaveBeenCalledTimes(initiallyPresent ? 0 : 1);
      expect(onError).toHaveBeenCalledTimes(initiallyPresent ? 1 : 0);
      if (initiallyPresent)
        expect(onError).toHaveBeenCalledWith(
          new Error('No handler provided for tool "getWeather"'),
        );
      expect(socket.sent).not.toContainEqual(
        expect.objectContaining({
          type: 'conversation-item-create',
          item: expect.objectContaining({ type: 'function-call-output' }),
        }),
      );
      const manualCallId = initiallyPresent ? 'before' : 'after';
      await act(async () => {
        result.current.addToolOutput(manualCallId, 'Manual result');
        await flushEvents();
      });
      expect(socket.sent).toContainEqual(
        expect.objectContaining({
          type: 'conversation-item-create',
          item: expect.objectContaining({
            type: 'function-call-output',
            callId: manualCallId,
            output: '"Manual result"',
          }),
        }),
      );
      expect(result.current.status).toBe('connected');
      expect(FakeWebSocket.instances).toEqual([socket]);
      expect(socket.close).not.toHaveBeenCalled();
    },
  );

  it('fences old callbacks at replacement and retires old media and queued sends in passive cleanup', async () => {
    const { track } = installLiveWebSocket();
    const serialization = deferred<void>();
    const serializing = vi.fn();
    const model = liveModel();
    model.serializeClientEvent = async event => {
      if (event.type === 'context-append') {
        serializing();
        await serialization.promise;
      }
      return event;
    };
    const onEvent = vi.fn();
    const onError = vi.fn();
    const failed = vi.fn();
    const connect = vi.spyOn(
      Experimental_AbstractRealtimeSession.prototype,
      'connect',
    );
    const dispose = vi.spyOn(
      Experimental_AbstractRealtimeSession.prototype,
      'dispose',
    );
    let committed: Experimental_UseRealtimeReturn;
    function Child({
      rt,
      endpoint,
    }: {
      rt: Experimental_UseRealtimeReturn;
      endpoint: string;
    }) {
      useLayoutEffect(() => {
        if (endpoint.endsWith('/B')) {
          const oldStore = connect.mock.contexts[0] as InstanceType<
            typeof Experimental_AbstractRealtimeSession
          >;
          oldStore.onEvent?.({
            type: 'session-usage',
            usage: { seconds: 99 },
            raw: {},
          });
          oldStore.onError?.(new Error('Retired callback'));
        }
        void rt.connect({ capture: endpoint.endsWith('/A') }).catch(failed);
      }, [rt.connect, endpoint]);
      return null;
    }
    function Conversation({ endpoint }: { endpoint: string }) {
      const rt = experimental_useRealtime({
        model,
        api: { websocket: endpoint },
        onEvent,
        onError,
      });
      useLayoutEffect(() => {
        committed = rt;
      });
      return <Child rt={rt} endpoint={endpoint} />;
    }
    const { rerender, unmount } = render(
      <Conversation endpoint="wss://app.example/A" />,
    );
    const first = FakeWebSocket.instances[0];
    await act(async () => {
      await openSession(first);
    });
    expect(committed!.isCapturing).toBe(true);
    const contexts = [...FakeAudioContext.instances];
    const lateCapture = contexts.flatMap(context => context.processors)[0]
      .onaudioprocess;
    let submission: Promise<void>;
    await act(async () => {
      submission = committed!.sendEvent({
        type: 'context-append',
        delegationId: null,
        content: 'Old configuration context',
      });
      await flushEvents();
    });
    expect(serializing).toHaveBeenCalledOnce();
    onEvent.mockClear();
    onError.mockClear();
    rerender(<Conversation endpoint="wss://app.example/B" />);
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose.mock.contexts[0]).toBe(connect.mock.contexts[0]);
    expect(first.close).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(contexts.every(context => context.state === 'closed')).toBe(true);
    const second = FakeWebSocket.instances[1];
    const oldFrames = [...first.sent];
    await act(async () => {
      serialization.resolve();
      await expect(submission!).rejects.toThrow(
        'Realtime connection is closed',
      );
      lateCapture?.({
        inputBuffer: { getChannelData: () => new Float32Array(128) },
      });
      await openSession(second);
    });
    expect(failed).not.toHaveBeenCalled();
    expect(first.sent).toEqual(oldFrames);
    expect(second.sent).not.toContainEqual(
      expect.objectContaining({ type: 'context-append' }),
    );
    expect(second.close).not.toHaveBeenCalled();
    expect(committed!.status).toBe('connected');
    expect(
      FakeWebSocket.instances.filter(socket => socket.readyState === 1),
    ).toEqual([second]);
    unmount();
    expect(dispose.mock.contexts[1]).toBe(connect.mock.contexts[1]);
    expect(second.close).toHaveBeenCalledOnce();
  });

  it('retires old capture and serialization before replacement child layout without publishing or disposing', async () => {
    const { track } = installLiveWebSocket();
    const model = liveModel();
    const serialization = deferred<void>();
    const serializing = vi.fn();
    model.serializeClientEvent = async event => {
      if (event.type === 'context-append') {
        serializing();
        await serialization.promise;
      }
      return event;
    };
    const connect = vi.spyOn(
      Experimental_AbstractRealtimeSession.prototype,
      'connect',
    );
    const originalDispose =
      Experimental_AbstractRealtimeSession.prototype.dispose;
    const dispose = vi.spyOn(
      Experimental_AbstractRealtimeSession.prototype,
      'dispose',
    );
    const warnings = vi.spyOn(console, 'error');
    const failed = vi.fn();
    const probe = vi.fn();
    function Child({
      connect,
      endpoint,
    }: {
      connect: Experimental_UseRealtimeReturn['connect'];
      endpoint: string;
    }) {
      useLayoutEffect(() => {
        if (endpoint.endsWith('/B')) probe();
        void connect({ capture: endpoint.endsWith('/A') }).catch(failed);
      }, [connect, endpoint]);
      return null;
    }
    function Conversation({ endpoint }: { endpoint: string }) {
      const rt = experimental_useRealtime({
        model,
        api: { websocket: endpoint },
        onError: failed,
      });
      return <Child connect={rt.connect} endpoint={endpoint} />;
    }
    const { rerender, unmount } = render(
      <Conversation endpoint="wss://app.example/A" />,
    );
    const first = FakeWebSocket.instances[0];
    await act(async () => {
      await openSession(first);
    });
    const oldStore = connect.mock.contexts[0] as InstanceType<
      typeof Experimental_AbstractRealtimeSession
    > & {
      subscribe: (key: string, callback: () => void) => () => void;
    };
    const published = vi.fn();
    const unsubscribe = [
      'status',
      'messages',
      'events',
      'isCapturing',
      'isPlaying',
      'session',
    ].map(key => oldStore.subscribe(key, published));
    const contexts = [...FakeAudioContext.instances];
    const capture = contexts.flatMap(context => context.processors)[0]
      .onaudioprocess;
    const samples = vi.fn(() => new Float32Array(128));
    const submission = oldStore.sendEvent({
      type: 'context-append',
      delegationId: null,
      content: 'Old configuration context',
    });
    const rejected = expect(submission).rejects.toThrow(
      'Realtime connection is closed',
    );
    await act(async () => {
      await flushEvents();
    });
    expect(serializing).toHaveBeenCalledOnce();
    const oldFrames = [...first.sent];

    // Hold physical disposal so queue rejection cannot be explained by passive cleanup.
    dispose.mockImplementation(function (this: typeof oldStore) {
      if (this !== oldStore) originalDispose.call(this);
    });
    probe.mockImplementation(() => {
      expect(dispose).not.toHaveBeenCalled();
      expect(first.close).not.toHaveBeenCalled();
      expect(track.stop).not.toHaveBeenCalled();
      expect(contexts.every(context => context.state === 'running')).toBe(true);
      capture?.({ inputBuffer: { getChannelData: samples } });
      serialization.resolve();
      expect(samples).not.toHaveBeenCalled();
      expect(() => oldStore.sendEvent({ type: 'input-audio-mute' })).toThrow(
        'not accepting submissions',
      );
      expect(published).not.toHaveBeenCalled();
    });
    rerender(<Conversation endpoint="wss://app.example/B" />);
    expect(probe).toHaveBeenCalledOnce();
    await act(async () => {
      await rejected;
      await flushEvents();
    });
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose.mock.contexts[0]).toBe(oldStore);
    expect(first.close).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(first.sent).toEqual(oldFrames);
    expect(serializing).toHaveBeenCalledOnce();
    expect(published).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();

    act(() => originalDispose.call(oldStore));
    unsubscribe.forEach(remove => remove());
    expect(first.close).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(contexts.every(context => context.state === 'closed')).toBe(true);
    const second = FakeWebSocket.instances[1];
    await act(async () => {
      await openSession(second);
    });
    expect(second.close).not.toHaveBeenCalled();
    expect(second.sent).not.toContainEqual(
      expect.objectContaining({ type: 'context-append' }),
    );
    unmount();
    expect(second.close).toHaveBeenCalledOnce();
    expect(warnings).not.toHaveBeenCalled();
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
    await act(async () => {
      await flushEvents();
    });
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
