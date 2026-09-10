import { vi, type Mock } from 'vitest';
import type { RealtimeServerEvent } from '../../types/realtime-model';
import { fakeStream } from './fake-realtime';

export class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: Array<{ type: string; [key: string]: unknown }> = [];
  constructor(public url: string, public protocols?: string[]) { FakeWebSocket.instances.push(this); }
  send = vi.fn((data: string) => { this.sent.push(JSON.parse(data)); });
  close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
  open() { this.readyState = 1; this.onopen?.(); }
  emit(event: RealtimeServerEvent) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

class FakeAudioNode {
  connect: Mock = vi.fn();
  disconnect: Mock = vi.fn();
  onaudioprocess: ((event: { inputBuffer: { getChannelData: (channel: number) => Float32Array } }) => void) | null = null;
  onended: (() => void) | null = null;
  buffer: unknown;
  start: Mock = vi.fn();
  stop: Mock = vi.fn();
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate: number;
  destination = {};
  processors: FakeAudioNode[] = [];
  sources: FakeAudioNode[] = [];
  mediaSources: FakeAudioNode[] = [];
  constructor(options: { sampleRate: number }) { this.sampleRate = options.sampleRate; FakeAudioContext.instances.push(this); }
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createScriptProcessor = vi.fn(() => {
    const node = new FakeAudioNode(); this.processors.push(node); return node;
  });
  createMediaStreamSource = vi.fn(() => {
    const node = new FakeAudioNode(); this.mediaSources.push(node); return node;
  });
  createBufferSource = vi.fn(() => {
    const node = new FakeAudioNode(); this.sources.push(node); return node;
  });
  createBuffer = vi.fn((_channels: number, size: number, rate: number) => ({ duration: size / rate, getChannelData: () => new Float32Array(size) }));
}

export function installLiveWebSocket() {
  const media = fakeStream();
  const getUserMedia = vi.fn(async () => media.stream);
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('fetch', fetch);
  FakeWebSocket.instances = [];
  FakeAudioContext.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { ...media, getUserMedia, fetch };
}
