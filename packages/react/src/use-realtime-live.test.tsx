import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakePeerConnection,
  fakeStream,
  flushEvents,
  installWebRTC,
  liveModel,
} from '../../ai/src/realtime/__fixtures__/fake-webrtc';

vi.mock('ai', async () => import('../../ai/src/realtime'));
const { experimental_useRealtime } = await import('./use-realtime');

describe('useRealtime with continuous models', () => {
  let browser: ReturnType<typeof installWebRTC>;
  beforeEach(() => {
    browser = installWebRTC();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retains a session through live updates and callback changes, exposing graceful close', async () => {
    const model = liveModel();
    const config = { instructions: 'Listen' };
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onEvent }) =>
        experimental_useRealtime({
          model,
          sessionConfig: config,
          api: { session: '/api/session' },
          onEvent,
        }),
      { initialProps: { onEvent: first } },
    );
    await act(async () => {
      await result.current.connect();
      await flushEvents();
    });
    expect(result.current.status).toBe('connected');
    const dc = FakePeerConnection.instances[0].dc;
    rerender({ onEvent: second });
    await act(async () => {
      dc.emit({
        type: 'transcript-fragment',
        speaker: 'user',
        delta: ' hello ',
        startMs: 0,
        endMs: 10,
        raw: {},
      });
      await flushEvents();
    });
    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(result.current.live?.transcripts[0].delta).toBe(' hello ');
    expect(second).toHaveBeenCalledOnce();
    await act(async () => {
      const closed = result.current.close();
      await flushEvents();
      dc.emit({
        type: 'session-closed',
        usage: { seconds: 3 },
        reason: 'requested',
        raw: {},
      });
      await closed;
    });
    expect(result.current.status).toBe('disconnected');
    expect(result.current.live?.finalization).toBe('confirmed');
    expect(result.current.live?.usage).toEqual({ seconds: 3 });
  });

  it('disposes on endpoint replacement and unmount and reconnects after strict-mode cleanup', async () => {
    const model = liveModel();
    const { result, rerender, unmount } = renderHook(
      ({ endpoint }) =>
        experimental_useRealtime({
          model,
          api: { session: endpoint },
        }),
      { initialProps: { endpoint: '/api/first' }, wrapper: StrictMode },
    );
    await act(async () => {
      await result.current.connect();
      await flushEvents();
    });
    const pc = FakePeerConnection.instances[0];
    rerender({ endpoint: '/api/second' });
    expect(pc.close).toHaveBeenCalledOnce();
    expect(browser.track.stop).toHaveBeenCalledOnce();
    const next = fakeStream();
    browser.getUserMedia.mockResolvedValue(next.stream);
    await act(async () => {
      await result.current.connect();
      await flushEvents();
    });
    expect(result.current.status).toBe('connected');
    unmount();
    expect(next.track.stop).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances[1].close).toHaveBeenCalledOnce();
  });
});
