import { RealtimeEventChannel } from './realtime-event-channel';
import {
  assertRealtimeFrameBudget,
  encodeRealtimeFrame,
} from './encode-realtime-frame';
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
  onClosing?: () => void;
  onClose: (error?: Error, event?: CloseEvent) => void;
};

function getCloseError(event: CloseEvent): Error | undefined {
  if (event.code === 1000 && event.wasClean) return undefined;
  return new Error(
    `Realtime WebSocket closed unexpectedly (code ${event.code}${
      event.reason === '' ? '' : `: ${event.reason}`
    })`,
  );
}

export class BrowserRealtimeTransport {
  private readonly model: RealtimeModel;
  private readonly continuous: boolean;
  private readonly onServerEvent: BrowserRealtimeTransportOptions['onServerEvent'];
  private readonly onError: BrowserRealtimeTransportOptions['onError'];
  private readonly onClose: BrowserRealtimeTransportOptions['onClose'];
  private ws: WebSocket | null = null;
  private codec: RealtimeEventChannel | undefined;
  private epoch = 0;
  private drainTimer?: ReturnType<typeof setTimeout>;
  private failing = false;
  private closing = false;

  constructor(private readonly options: BrowserRealtimeTransportOptions) {
    this.model = options.model;
    this.continuous = options.model.capabilities?.conversation === 'continuous';
    this.onServerEvent = options.onServerEvent;
    this.onError = options.onError;
    this.onClose = options.onClose;
  }

  get isOpen(): boolean {
    return (
      !this.closing && !this.failing && this.ws?.readyState === WebSocket.OPEN
    );
  }

  connect({
    mode,
    token,
    url,
    onOpen,
    protocols,
  }: (
    | { mode: 'client-secret'; token: string; protocols?: never }
    | { mode: 'relay'; token?: never; protocols?: string[] }
  ) & {
    url: string;
    onOpen: () => void | Promise<void>;
  }): void {
    this.disconnect();

    const epoch = this.epoch;
    if (
      mode !== 'relay' &&
      (mode !== 'client-secret' ||
        typeof token !== 'string' ||
        token.trim() === '')
    )
      throw new Error(
        'Realtime client-secret connection requires a nonempty token',
      );
    const wsConfig =
      mode === 'relay'
        ? { url, protocols }
        : this.model.getWebSocketConfig?.({ token, url });
    if (this.epoch !== epoch) return;
    if (wsConfig == null)
      throw new Error('Model does not support client-secret WebSockets');
    const finalUrl = wsConfig.url;
    const finalProtocols = wsConfig.protocols;
    if (this.epoch !== epoch) return;
    try {
      if (typeof finalUrl !== 'string' || !/^wss?:\/\//i.test(finalUrl))
        throw new Error('Invalid realtime WebSocket URL');
      const parsed = new URL(finalUrl);
      if (
        !['ws:', 'wss:'].includes(parsed.protocol) ||
        parsed.hostname === '' ||
        finalUrl.includes('#')
      )
        throw new Error('Invalid realtime WebSocket URL');
    } catch {
      throw new Error(
        'Invalid realtime WebSocket URL; expected an absolute ws:// or wss:// URL with a host and no fragment',
      );
    }
    if (this.epoch !== epoch) return;
    const ws = new WebSocket(finalUrl, finalProtocols);

    // Track the socket immediately (not just in `onopen`) so that calling
    // `disconnect()` while it is still connecting actually closes it. Otherwise
    // `close()` would be a no-op and the socket could open afterwards and fire
    // the `onOpen` (session-update) callback against a disconnected session.
    this.ws = ws;
    let starting = false;
    let connectionError: Error | undefined;
    const codec = new RealtimeEventChannel({
      model: this.model,
      send: data => {
        if (this.epoch !== epoch || this.ws !== ws || !this.isOpen)
          throw new Error('Realtime WebSocket is not open');
        this.sendRaw(data);
      },
      onEvent: this.onServerEvent,
      onError: error => {
        if (!starting) this.onError(error);
      },
      onFatalError: error => this.fail(error),
    });
    if (this.epoch !== epoch) {
      codec.dispose();
      return;
    }
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
        if (this.epoch === epoch)
          this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    };

    ws.onmessage = messageEvent => {
      if (this.ws === ws) this.codec?.receive(messageEvent.data);
    };

    ws.onerror = () => {
      if (this.ws === ws) {
        connectionError = new Error('WebSocket connection error');
        this.failing = true;
      }
    };

    ws.onclose = event => {
      if (this.ws === ws) {
        this.ws = null;
        const closeError = getCloseError(event) ?? connectionError;
        codec.stopWriting();
        this.notifyClosing();
        if (this.epoch !== epoch) return;
        const complete = () => {
          if (this.epoch !== epoch) return;
          clearTimeout(this.drainTimer);
          this.epoch++;
          codec.dispose();
          try {
            this.onClose(closeError, event);
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
    this.closing = false;
    ws?.close();
  }

  sendEvent(
    event: RealtimeClientEvent,
    shouldSend?: () => boolean,
    automaticAudio = false,
  ): Promise<void> {
    if (this.failing || this.closing)
      throw new Error('Realtime connection is closed');
    if (this.codec == null) return Promise.resolve();
    const epoch = this.epoch;
    const failed = (error: unknown) => {
      if (automaticAudio && this.epoch === epoch && this.isOpen)
        this.fail(error instanceof Error ? error : new Error(String(error)));
    };
    try {
      const sent = this.codec.send(event, shouldSend);
      void sent.catch(failed);
      return sent;
    } catch (error) {
      failed(error);
      throw error;
    }
  }

  finish(): Promise<void> {
    return this.codec?.finish() ?? Promise.resolve();
  }

  /** Drain accepted events when media or protocol continuity is lost. */
  fail(error: Error): void {
    if (this.failing) return;
    this.failing = true;
    const epoch = this.epoch;
    const ws = this.ws;
    this.ws = null;
    this.codec?.stopWriting();
    ws?.close();
    this.notifyClosing();
    if (this.epoch !== epoch) return;
    const drain = this.finish();
    if (this.options.onFatalError != null)
      this.options.onFatalError(error, drain);
    else {
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

  private notifyClosing(): void {
    if (this.closing) return;
    this.closing = true;
    try {
      this.options.onClosing?.();
    } catch (error) {
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
    const ws = this.ws;
    const epoch = this.epoch;
    if (ws == null || !this.isOpen) return;
    const frame = encodeRealtimeFrame(data);
    if (this.epoch !== epoch || this.ws !== ws || !this.isOpen)
      throw new Error('Realtime connection is closed');
    if (this.continuous) assertRealtimeFrameBudget(frame, ws.bufferedAmount);
    ws.send(frame.data);
  }

  dispose(): void {
    this.disconnect();
  }
}
