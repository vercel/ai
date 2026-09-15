import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRealtimeWebRTC } from './browser-realtime-webrtc';
import {
  deferred,
  FakePeerConnection,
  fakeStream,
  flushEvents,
  installWebRTC,
  liveModel,
} from './__fixtures__/fake-webrtc';

describe('WebRTC sender ownership and shutdown', () => {
  let browser: ReturnType<typeof installWebRTC>;
  const transports: BrowserRealtimeWebRTC[] = [];
  const create = () => {
    const callbacks = {
      onCapturing: vi.fn(),
      onClose: vi.fn(),
      onClosing: vi.fn(),
      onError: vi.fn(),
      onEvent: vi.fn(),
      onPlaying: vi.fn(),
    };
    const rtc = new BrowserRealtimeWebRTC({ model: liveModel(), ...callbacks });
    transports.push(rtc);
    return { rtc, ...callbacks };
  };
  const setup = { api: '/api/session', timeoutMs: 1_000 };

  beforeEach(() => {
    browser = installWebRTC();
  });
  afterEach(() => {
    transports.forEach(rtc => rtc.dispose());
    transports.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('serializes stop behind an in-flight attachment and fences the stale start', async () => {
    const { rtc, onCapturing } = create();
    await rtc.connect({ ...setup, capture: false });
    const pc = FakePeerConnection.instances[0];
    const attached = deferred<void>();
    const replace = pc.sender.replaceTrack.getMockImplementation();
    pc.sender.replaceTrack.mockImplementation(async track => {
      if (track != null) await attached.promise;
      await replace?.(track);
    });
    const starting = rtc.startCapture(browser.stream);
    await flushEvents();
    expect(pc.sender.replaceTrack).toHaveBeenLastCalledWith(browser.track);
    onCapturing.mockClear();
    const stopping = rtc.stopCapture();
    await flushEvents();
    expect(pc.sender.replaceTrack).toHaveBeenCalledTimes(2);
    expect(onCapturing).not.toHaveBeenCalled();
    attached.resolve();
    await Promise.all([starting, stopping]);
    expect(pc.sender.track).toBeNull();
    expect(onCapturing).toHaveBeenCalledExactlyOnceWith(false);
    expect(browser.track.stop).not.toHaveBeenCalled();
    expect(browser.track.enabled).toBe(true);
  });

  it('keeps capture published until detach completes and queues a newer start behind it', async () => {
    const { rtc, onCapturing } = create();
    await rtc.connect({ ...setup, stream: browser.stream });
    const pc = FakePeerConnection.instances[0];
    const detached = deferred<void>();
    pc.sender.replaceTrack.mockImplementationOnce(async track => {
      await detached.promise;
      pc.sender.track = track;
    });
    onCapturing.mockClear();
    const stopping = rtc.stopCapture();
    const next = fakeStream();
    const starting = rtc.startCapture(next.stream);
    await flushEvents();
    expect(pc.sender.replaceTrack).toHaveBeenCalledExactlyOnceWith(null);
    expect(pc.sender.track).toBe(browser.track);
    expect(onCapturing).not.toHaveBeenCalled();
    detached.resolve();
    await Promise.all([stopping, starting]);
    expect(pc.sender.track).toBe(next.track);
    expect(onCapturing.mock.calls).toEqual([[false], [true]]);
    expect(browser.track.stop).not.toHaveBeenCalled();
    expect(next.track.stop).not.toHaveBeenCalled();
  });

  it('detaches an obsolete attachment before attaching the latest requested microphone', async () => {
    const { rtc, onCapturing } = create();
    await rtc.connect({ ...setup, capture: false });
    const pc = FakePeerConnection.instances[0];
    const attached = deferred<void>();
    const replace = pc.sender.replaceTrack.getMockImplementation();
    pc.sender.replaceTrack.mockImplementation(async track => {
      if (track === (browser.track as unknown as MediaStreamTrack))
        await attached.promise;
      await replace?.(track);
    });
    const first = rtc.startCapture(browser.stream);
    await flushEvents();
    onCapturing.mockClear();
    const next = fakeStream();
    const second = rtc.startCapture(next.stream);
    await flushEvents();
    expect(pc.sender.replaceTrack).toHaveBeenCalledTimes(2);
    attached.resolve();
    await Promise.all([first, second]);
    expect(pc.sender.replaceTrack.mock.calls.map(([track]) => track)).toEqual([
      null,
      browser.track,
      null,
      null,
      next.track,
    ]);
    expect(pc.sender.track).toBe(next.track);
    expect(onCapturing.mock.calls).toEqual([[false], [true]]);
    expect(browser.track.stop).not.toHaveBeenCalled();
  });

  it('does not wait for microphone permission to stop and releases a late owned stream', async () => {
    const { rtc } = create();
    await rtc.connect({ ...setup, capture: false });
    const media = deferred<MediaStream>();
    browser.getUserMedia.mockReturnValueOnce(media.promise);
    const starting = rtc.startCapture();
    await flushEvents();
    await rtc.stopCapture();
    media.resolve(browser.stream);
    await starting;
    expect(browser.track.stop).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances[0].sender.track).toBeNull();
  });

  it('does not let an old attachment completion mutate a reconnected peer', async () => {
    const { rtc, onCapturing } = create();
    await rtc.connect({ ...setup, capture: false });
    const old = FakePeerConnection.instances[0];
    const attached = deferred<void>();
    const replace = old.sender.replaceTrack.getMockImplementation();
    old.sender.replaceTrack.mockImplementation(async track => {
      if (track != null) await attached.promise;
      await replace?.(track);
    });
    const starting = rtc.startCapture(browser.stream);
    await flushEvents();
    const stopping = rtc.stopCapture();
    const next = fakeStream();
    await rtc.connect({ ...setup, stream: next.stream });
    onCapturing.mockClear();
    attached.resolve();
    await Promise.all([starting, stopping]);
    expect(old.close).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances[1].sender.track).toBe(next.track);
    expect(
      FakePeerConnection.instances[1].sender.replaceTrack,
    ).not.toHaveBeenCalled();
    expect(onCapturing).not.toHaveBeenCalled();
    expect(browser.track.stop).not.toHaveBeenCalled();
  });

  it('closes the peer on rejected detach before reporting stopped, without stopping borrowed tracks', async () => {
    const { rtc, onCapturing, onClosing, onError } = create();
    await rtc.connect({ ...setup, stream: browser.stream });
    const pc = FakePeerConnection.instances[0];
    const detached = deferred<void>();
    pc.sender.replaceTrack.mockImplementationOnce(async () => {
      await detached.promise;
      throw new Error('detach rejected');
    });
    onCapturing.mockClear();
    const stoppedPeerStates: string[] = [];
    onCapturing.mockImplementation(value => {
      if (!value) stoppedPeerStates.push(pc.connectionState);
    });
    const stopping = rtc.stopCapture();
    await flushEvents();
    expect(onCapturing).not.toHaveBeenCalled();
    detached.resolve();
    await stopping;
    await flushEvents();
    expect(pc.close).toHaveBeenCalledOnce();
    expect(stoppedPeerStates.length).toBeGreaterThan(0);
    expect(stoppedPeerStates.every(state => state === 'closed')).toBe(true);
    expect(browser.track.stop).not.toHaveBeenCalled();
    expect(browser.track.enabled).toBe(true);
    expect(onClosing).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error('detach rejected'),
    );
  });

  it.each(['data-channel', 'ice'] as const)(
    'establishes %s drain semantics before capture callbacks and retains queued terminal usage',
    async cause => {
      const { rtc, onCapturing, onClosing, onEvent, onClose, onError } =
        create();
      await rtc.connect({ ...setup, stream: browser.stream });
      const pc = FakePeerConnection.instances[0];
      const terminal = deferred<string>();
      const blob = new Blob();
      vi.spyOn(blob, 'text').mockReturnValue(terminal.promise);
      pc.dc.onmessage?.({ data: blob });
      onCapturing.mockClear();
      let drain: Promise<void> | undefined;
      onClosing.mockImplementation(() => {
        expect(onCapturing).not.toHaveBeenCalled();
        expect(() => rtc.sendEvent({ type: 'input-audio-mute' })).toThrow();
        drain = rtc.finish();
      });
      if (cause === 'data-channel') pc.dc.close();
      else {
        pc.iceConnectionState = 'failed';
        pc.oniceconnectionstatechange?.();
      }
      expect(onClosing).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledTimes(cause === 'ice' ? 1 : 0);
      if (cause === 'ice')
        expect(onError).toHaveBeenCalledWith(
          new Error('Realtime ICE connection failed'),
        );
      expect(drain).toBeDefined();
      await flushEvents();
      expect(onClose).not.toHaveBeenCalled();
      const event = { type: 'session-closed', usage: { seconds: 9 }, raw: {} };
      terminal.resolve(JSON.stringify(event));
      await drain;
      await flushEvents();
      expect(onEvent).toHaveBeenCalledWith(event);
      expect(onClose).toHaveBeenCalledOnce();
      expect(browser.track.stop).not.toHaveBeenCalled();
    },
  );

  it.each(['data-channel', 'ice'] as const)(
    'fences teardown when the %s closing callback reconnects',
    async cause => {
      const { rtc, onClosing } = create();
      await rtc.connect({ ...setup, stream: browser.stream });
      const pc = FakePeerConnection.instances[0];
      const next = fakeStream();
      let reconnecting: Promise<void> | undefined;
      onClosing.mockImplementationOnce(() => {
        reconnecting = rtc.connect({ ...setup, stream: next.stream });
      });
      if (cause === 'data-channel') pc.dc.close();
      else {
        pc.iceConnectionState = 'failed';
        pc.oniceconnectionstatechange?.();
      }
      await reconnecting;
      await flushEvents();
      expect(pc.close).toHaveBeenCalledOnce();
      expect(FakePeerConnection.instances[1].close).not.toHaveBeenCalled();
      expect(FakePeerConnection.instances[1].sender.track).toBe(next.track);
      expect(next.track.stop).not.toHaveBeenCalled();
    },
  );

  it.each([
    { sdp: '', sessionId: 'session-1' },
    { sdp: ' \r\n\t', sessionId: 'session-1' },
    { sdp: 'remote-answer', sessionId: '' },
    { sdp: 'remote-answer', sessionId: ' \t ' },
    { sdp: null, sessionId: 'session-1' },
    { sdp: 'remote-answer', sessionId: 42 },
  ])(
    'rejects an invalid SDP setup answer %j before negotiation',
    async answer => {
      const { rtc } = create();
      browser.fetch.mockResolvedValueOnce(Response.json(answer));
      await expect(rtc.connect(setup)).rejects.toThrow(
        'Invalid realtime session answer',
      );
      expect(
        FakePeerConnection.instances[0].setRemoteDescription,
      ).not.toHaveBeenCalled();
      expect(FakePeerConnection.instances[0].close).toHaveBeenCalledOnce();
      expect(browser.track.stop).toHaveBeenCalledOnce();
    },
  );

  it.each(['declared', 'chunked', 'understated'] as const)(
    'bounds a %s SDP response in bytes and cancels the remaining body',
    async size => {
      const { rtc } = create();
      const cancel = vi.fn();
      const response = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('é'.repeat(512 * 1024)),
            );
            controller.enqueue(new TextEncoder().encode('x'));
          },
          cancel,
        }),
        {
          headers:
            size === 'chunked'
              ? {}
              : { 'Content-Length': size === 'declared' ? '1048577' : '1' },
        },
      );
      browser.fetch.mockResolvedValueOnce(response);
      await expect(rtc.connect(setup)).rejects.toThrow(
        'answer exceeds the 1 MiB limit',
      );
      expect(cancel).toHaveBeenCalledOnce();
      expect(
        FakePeerConnection.instances[0].setRemoteDescription,
      ).not.toHaveBeenCalled();
      expect(browser.track.stop).toHaveBeenCalledOnce();
    },
  );

  it('preserves SDP whitespace after validating nonempty trimmed fields', async () => {
    const { rtc } = create();
    const sdp = 'v=0\r\ns=-\r\n';
    browser.fetch.mockResolvedValueOnce(
      Response.json({ sdp, sessionId: ' session-1 ' }),
    );
    await rtc.connect({ ...setup, capture: false });
    expect(
      FakePeerConnection.instances[0].setRemoteDescription,
    ).toHaveBeenCalledWith({ type: 'answer', sdp });
  });

  it('preserves the RTC buffer policy independently of the new Live WSS wire caps', async () => {
    const { rtc, onClose } = create();
    await rtc.connect({ ...setup, capture: false });
    const pc = FakePeerConnection.instances[0];
    const event = {
      type: 'context-append' as const,
      content: 'é'.repeat(128 * 1024),
      delegationId: null,
    };
    pc.dc.bufferedAmount = 1024 * 1024;
    await rtc.sendEvent(event);
    expect(pc.dc.sent).toEqual([event]);
    pc.dc.bufferedAmount++;
    await expect(rtc.sendEvent(event)).rejects.toThrow(
      'Realtime data channel buffer is full',
    );
    expect(pc.dc.sent).toEqual([event]);
    expect(onClose).not.toHaveBeenCalled();
    expect(pc.close).not.toHaveBeenCalled();
  });
});
