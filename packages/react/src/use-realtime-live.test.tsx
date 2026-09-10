import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deferred,
  FakePeerConnection,
  fakeStream,
  flushEvents,
  installWebRTC,
  liveModel,
} from '../../ai/src/realtime/__fixtures__/fake-webrtc';

vi.mock('ai', async () => import('../../ai/src/realtime'));
const { experimental_useRealtime } = await import('./use-realtime');

describe('useRealtime with continuous models', () => {
  it('keeps capture controls and session state coherent through StrictMode and callback replacement', async () => {
    const model = liveModel();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onError }) =>
        experimental_useRealtime({
          model,
          api: { session: '/session' },
          maxPlaybackBufferSeconds: 1,
          rtcDisconnectTimeoutMs: 500,
          autoContinueTools: false,
          onError,
        }),
      { initialProps: { onError: first }, wrapper: StrictMode },
    );
    expect(FakePeerConnection.instances).toHaveLength(0);
    await act(async () => {
      await result.current.connect({ capture: false });
    });
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(result.current.session?.finalization).toBe('pending');
    rerender({ onError: second });
    await act(async () => {
      result.current.startAudioCapture(browser.stream);
      await flushEvents();
    });
    expect(result.current.isCapturing).toBe(true);
    await act(async () => {
      result.current.stopAudioCapture();
      await flushEvents();
    });
    expect(result.current.isCapturing).toBe(false);
    expect(browser.track.stop).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.resumeAudioCapture();
    });
    expect(result.current.isCapturing).toBe(true);
    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

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
    expect(result.current.session?.transcripts[0].delta).toBe(' hello ');
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
    expect(result.current.session?.finalization).toBe('confirmed');
    expect(result.current.session?.usage).toEqual({ seconds: 3 });
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

  it('publishes confirmed clean RTC closure after draining delayed usage in StrictMode', async () => {
    const model = liveModel();
    const onError = vi.fn();
    const { result } = renderHook(
      () =>
        experimental_useRealtime({
          model,
          api: { session: '/session' },
          onError,
        }),
      { wrapper: StrictMode },
    );
    await act(async () => {
      await result.current.connect({ capture: false });
    });
    const terminal = deferred<string>();
    const blob = Object.assign(new Blob(), { text: () => terminal.promise });
    const dc = FakePeerConnection.instances[0].dc;
    await act(async () => {
      dc.onmessage?.({ data: blob });
      dc.close();
      await flushEvents();
    });
    expect(result.current.status).toBe('closing');
    expect(onError).not.toHaveBeenCalled();
    await act(async () => {
      terminal.resolve(
        JSON.stringify({
          type: 'session-closed',
          usage: { seconds: 4 },
          reason: 'requested',
          raw: {},
        }),
      );
      await flushEvents();
    });
    expect(result.current.status).toBe('disconnected');
    expect(result.current.session).toMatchObject({
      finalization: 'confirmed',
      usage: { seconds: 4 },
    });
    expect(onError).not.toHaveBeenCalled();
    expect(FakePeerConnection.instances[0].close).toHaveBeenCalledOnce();
  });
});
