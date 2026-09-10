import { RealtimeEventChannel } from './realtime-event-channel';
import type {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
} from '../types/realtime-model';

export type BrowserRealtimeTransportOptions = {
  model: RealtimeModel;
  onServerEvent: (event: RealtimeServerEvent) => void | Promise<void>;
  onError: (error: Error) => void;
  onClose: () => void;
};

export class BrowserRealtimeTransport {
  private readonly model: RealtimeModel;
  private readonly onServerEvent: BrowserRealtimeTransportOptions['onServerEvent'];
  private readonly onError: BrowserRealtimeTransportOptions['onError'];
  private readonly onClose: BrowserRealtimeTransportOptions['onClose'];
  private ws: WebSocket | null = null;
  private codec: RealtimeEventChannel | undefined;
  private epoch = 0;
  private drainTimer?: ReturnType<typeof setTimeout>;

  constructor(options: BrowserRealtimeTransportOptions) {
    this.model = options.model;
    this.onServerEvent = options.onServerEvent;
    this.onError = options.onError;
    this.onClose = options.onClose;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect({
    token,
    url,
    onOpen,
    protocols,
  }: {
    token?: string;
    url: string;
    /** Omit token to connect directly to an application-owned relay. */
    protocols?: string[];
    onOpen: () => void;
  }): void {
    this.disconnect();

    const epoch = this.epoch;
    const wsConfig =
      token == null
        ? { url, protocols }
        : this.model.getWebSocketConfig({ token, url });
    const ws = new WebSocket(wsConfig.url, wsConfig.protocols);

    // Track the socket immediately (not just in `onopen`) so that calling
    // `disconnect()` while it is still connecting actually closes it. Otherwise
    // `close()` would be a no-op and the socket could open afterwards and fire
    // the `onOpen` (session-update) callback against a disconnected session.
    this.ws = ws;
    const codec = new RealtimeEventChannel({
      model: this.model,
      send: data => {
        if (this.ws !== ws || ws.readyState !== WebSocket.OPEN)
          throw new Error('Realtime WebSocket is not open');
        if (ws.bufferedAmount > 128 * 1024)
          throw new Error('Realtime WebSocket send buffer is full');
        this.sendRaw(data);
      },
      onEvent: this.onServerEvent,
      onError: this.onError,
    });
    this.codec = codec;

    ws.onopen = () => {
      // Ignore a late open for a socket that has since been replaced/closed.
      if (this.ws !== ws) return;
      try {
        onOpen();
      } catch (error) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    ws.onmessage = messageEvent => {
      if (this.ws === ws) this.codec?.receive(messageEvent.data);
    };

    ws.onerror = () => {
      if (this.ws === ws) this.onError(new Error('WebSocket connection error'));
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        const complete = () => {
          if (this.epoch !== epoch) return;
          clearTimeout(this.drainTimer);
          this.epoch++;
          codec.dispose();
          this.onClose();
        };
        this.drainTimer = setTimeout(complete, 1_000);
        void codec.finish().then(complete);
      }
    };
  }

  disconnect(): void {
    this.epoch++;
    clearTimeout(this.drainTimer);
    const ws = this.ws;
    this.ws = null;
    this.codec?.dispose();
    this.codec = undefined;
    ws?.close();
  }

  sendEvent(
    event: RealtimeClientEvent,
    shouldSend?: () => boolean,
  ): Promise<void> {
    return this.codec?.send(event, shouldSend) ?? Promise.resolve();
  }

  sendRaw(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (
        typeof data === 'string' ||
        data instanceof ArrayBuffer ||
        ArrayBuffer.isView(data) ||
        data instanceof Blob
      ) {
        this.ws.send(data);
      } else {
        this.ws.send(JSON.stringify(data));
      }
    }
  }

  dispose(): void {
    this.disconnect();
  }
}
