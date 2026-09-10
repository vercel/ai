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
  onFatalError?: (error: Error, drain?: Promise<void>) => void;
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
  private failing = false;

  constructor(private readonly options: BrowserRealtimeTransportOptions) {
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
    onOpen: () => void | Promise<void>;
  }): void {
    this.disconnect();

    const epoch = this.epoch;
    const wsConfig =
      token == null
        ? { url, protocols }
        : this.model.getWebSocketConfig?.({ token, url });
    if (wsConfig == null)
      throw new Error('Model does not support client-secret WebSockets');
    const ws = new WebSocket(wsConfig.url, wsConfig.protocols);

    // Track the socket immediately (not just in `onopen`) so that calling
    // `disconnect()` while it is still connecting actually closes it. Otherwise
    // `close()` would be a no-op and the socket could open afterwards and fire
    // the `onOpen` (session-update) callback against a disconnected session.
    this.ws = ws;
    let starting = false;
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
      onError: error => {
        if (!starting) this.onError(error);
      },
      onFatalError: error => this.fail(error),
    });
    this.codec = codec;

    ws.onopen = () => {
      // Ignore a late open for a socket that has since been replaced/closed.
      if (this.ws !== ws) return;
      starting = true;
      try {
        void Promise.resolve(onOpen())
          .catch(error => {
            if (this.ws === ws)
              this.fail(
                error instanceof Error ? error : new Error(String(error)),
              );
          })
          .finally(() => {
            starting = false;
          });
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    };

    ws.onmessage = messageEvent => {
      if (this.ws === ws) this.codec?.receive(messageEvent.data);
    };

    ws.onerror = () => {
      if (this.ws === ws) this.fail(new Error('WebSocket connection error'));
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        const complete = () => {
          if (this.epoch !== epoch) return;
          clearTimeout(this.drainTimer);
          this.epoch++;
          codec.dispose();
          try {
            this.onClose();
          } catch (error) {
            this.reportCallbackError(error);
          }
        };
        this.drainTimer = setTimeout(complete, 1_000);
        void this.awaitDrain(codec.finish(), complete);
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
    this.failing = false;
    ws?.close();
  }

  sendEvent(
    event: RealtimeClientEvent,
    shouldSend?: () => boolean,
  ): Promise<void> {
    if (this.failing) throw new Error('Realtime connection is closed');
    if (this.codec == null) return Promise.resolve();
    try {
      const sent = this.codec.send(event, shouldSend);
      if (event.type === 'input-audio-append')
        void sent.catch(error => {
          if (this.isOpen) this.fail(error);
        });
      return sent;
    } catch (error) {
      if (event.type === 'input-audio-append' && this.isOpen)
        this.fail(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  finish(): Promise<void> {
    return this.codec?.finish() ?? Promise.resolve();
  }

  private fail(error: Error): void {
    if (this.failing) return;
    this.failing = true;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    const drain = this.finish();
    if (this.options.onFatalError != null)
      this.options.onFatalError(error, drain);
    else {
      const epoch = this.epoch;
      const complete = () => {
        if (epoch !== this.epoch) return;
        this.disconnect();
        try {
          this.onClose();
        } catch (cause) {
          this.reportCallbackError(cause);
        }
      };
      this.drainTimer = setTimeout(complete, 1_000);
      void this.awaitDrain(drain, complete);
      this.reportCallbackError(error);
    }
  }

  private async awaitDrain(
    drain: Promise<void>,
    complete: () => void,
  ): Promise<void> {
    try {
      await drain;
    } catch {
      /* Transport loss still requires finalization. */
    }
    try {
      complete();
    } catch (error) {
      this.reportCallbackError(error);
    }
  }

  private reportCallbackError(error: unknown): void {
    try {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    } catch {
      /* Application callbacks cannot interrupt teardown. */
    }
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
