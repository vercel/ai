import { vi, type Mock } from 'vitest';
import type { RealtimeModel, RealtimeServerEvent } from '../../types/realtime-model';

export class FakeTrack extends EventTarget {
  enabled = true;
  muted = false;
  readyState = 'live';
  stop = vi.fn(() => { this.readyState = 'ended'; });
}

export function fakeStream() {
  const track = new FakeTrack();
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream };
}

export class FakeDataChannel {
  readyState = 'connecting';
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: Array<{ type: string }> = [];
  send = vi.fn((data: string) => { this.sent.push(JSON.parse(data)); });
  close = vi.fn(() => { this.readyState = 'closed'; this.onclose?.(); });
  emit(event: RealtimeServerEvent) { this.onmessage?.({ data: JSON.stringify(event) }); }
  open() { this.readyState = 'open'; this.onopen?.(); }
}

export class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  static autoStart = true;
  static autoOpen = true;
  static gather = true;
  dc = new FakeDataChannel();
  iceGatheringState = FakePeerConnection.gather ? 'complete' : 'gathering';
  connectionState = 'new';
  localDescription: { sdp: string } | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  iceConnectionState = 'new';
  oniceconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  constructor() { FakePeerConnection.instances.push(this); }
  createDataChannel = vi.fn(() => this.dc);
  sender = { replaceTrack: vi.fn(async (_track: unknown) => {}) };
  addTrack: Mock = vi.fn(() => this.sender);
  addTransceiver = vi.fn(() => ({ sender: this.sender }));
  createOffer = vi.fn(async () => {
    if (this.dc.onmessage == null || this.ontrack == null || this.onicegatheringstatechange == null || this.dc.onopen == null) throw new Error('Listeners were installed too late');
    return { type: 'offer', sdp: 'local-offer' };
  });
  setLocalDescription = vi.fn(async (offer: { sdp: string }) => { this.localDescription = offer; });
  setRemoteDescription = vi.fn(async () => {
    if (FakePeerConnection.autoOpen) this.dc.open();
    if (FakePeerConnection.autoStart) this.dc.emit({ type: 'session-started', sessionId: 'session-1', delegationMode: 'provider', raw: {} });
  });
  close = vi.fn(() => { this.connectionState = 'closed'; this.onconnectionstatechange?.(); });
}

type FakeAudio = {
  autoplay: boolean;
  srcObject: MediaStream | null;
  onplaying: (() => void) | null;
  onpause: (() => void) | null;
  onwaiting: (() => void) | null;
  onended: (() => void) | null;
  play: Mock<() => Promise<void>>;
  pause: Mock;
};

export function installWebRTC(): {
  track: FakeTrack;
  stream: MediaStream;
  getUserMedia: Mock<() => Promise<MediaStream>>;
  audio: FakeAudio;
  fetch: Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;
} {
  FakePeerConnection.instances = [];
  FakePeerConnection.autoOpen = true;
  FakePeerConnection.autoStart = true;
  FakePeerConnection.gather = true;
  const media = fakeStream();
  const getUserMedia = vi.fn(async () => media.stream);
  const audio = {
    autoplay: false,
    srcObject: null as MediaStream | null,
    onplaying: null as (() => void) | null,
    onpause: null as (() => void) | null,
    onwaiting: null as (() => void) | null,
    onended: null as (() => void) | null,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  };
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  // Preserve the DOM used by React tests while substituting its audio element.
  if (typeof document === 'undefined') {
    vi.stubGlobal('document', { createElement: vi.fn(() => audio) });
  } else {
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) =>
      tag === 'audio' ? audio : createElement(tag, options)) as typeof document.createElement);
  }
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => Response.json({ sessionId: 'session-1', sdp: 'remote-answer' }));
  vi.stubGlobal('fetch', fetch);
  return { ...media, getUserMedia, audio, fetch };
}

export function liveModel(): RealtimeModel {
  return {
    specificationVersion: 'v4', provider: 'test', modelId: 'live',
    capabilities: { conversation: 'continuous', transports: ['webrtc', 'websocket'], connections: ['webrtc', 'server-websocket'], startup: 'session-start', finalization: 'session-close' },
    getWebRTCConfig: () => ({ dataChannelLabel: 'model-events' }),
    getWebSocketConfig: vi.fn(),
    doCreateClientSecret: vi.fn(),
    buildSessionConfig: vi.fn(),
    parseServerEvent: event => event as RealtimeServerEvent,
    serializeClientEvent: async event => event,
  };
}

export async function flushEvents() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
