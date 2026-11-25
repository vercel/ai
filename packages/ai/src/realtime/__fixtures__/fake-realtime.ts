import { vi } from 'vitest';
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

export function liveModel(): RealtimeModel {
  return {
    specificationVersion: 'v4', provider: 'test', modelId: 'live',
    capabilities: { conversation: 'continuous', transports: ['websocket'], connections: ['server-websocket'], startup: 'session-start', finalization: 'session-close' },
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
