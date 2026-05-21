import { parseJSON } from '@ai-sdk/provider-utils';
import type { WebSocket } from 'ws';
import {
  inboundMessageSchema,
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './codex-bridge-protocol';

type EventType = OutboundMessage['type'];

type Listener<T extends EventType> = (
  event: Extract<OutboundMessage, { type: T }>,
) => void;

/**
 * Host-side typed wrapper around the bridge WebSocket connection. Buffers
 * inbound messages until a listener for their type is registered, so callers
 * that subscribe asynchronously do not miss early frames (e.g. the first
 * `tool-call` arriving before `doPrompt` finishes wiring up its handlers).
 */
export class BridgeChannel {
  private readonly listeners = new Map<EventType, Set<Listener<EventType>>>();
  private readonly buffered = new Map<EventType, OutboundMessage[]>();
  private readonly onCloseHandlers = new Set<
    (code: number, reason: string) => void
  >();
  private closed = false;

  constructor(private readonly ws: WebSocket) {
    this.ws.on('message', raw => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      void this.handleIncoming(text);
    });
    this.ws.on('close', (code, reason) => {
      this.closed = true;
      for (const h of this.onCloseHandlers) h(code, reason.toString('utf8'));
    });
    this.ws.on('error', err => {
      this.dispatch({ type: 'error', error: err });
    });
  }

  on<T extends EventType>(type: T, listener: Listener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as unknown as Listener<EventType>);

    const buffered = this.buffered.get(type);
    if (buffered) {
      this.buffered.delete(type);
      for (const event of buffered) {
        listener(event as Extract<OutboundMessage, { type: T }>);
      }
    }

    return () => {
      set!.delete(listener as unknown as Listener<EventType>);
    };
  }

  onClose(handler: (code: number, reason: string) => void): void {
    this.onCloseHandlers.add(handler);
  }

  send(message: InboundMessage): void {
    if (this.closed) {
      throw new Error(
        `BridgeChannel: cannot send ${message.type} — channel is closed.`,
      );
    }
    inboundMessageSchema.parse(message);
    this.ws.send(JSON.stringify(message));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ws.close();
  }

  isClosed(): boolean {
    return this.closed;
  }

  private async handleIncoming(text: string): Promise<void> {
    let message: OutboundMessage;
    try {
      message = await parseJSON({ text, schema: outboundMessageSchema });
    } catch (err) {
      this.dispatch({ type: 'error', error: err });
      return;
    }
    this.dispatch(message);
  }

  private dispatch(message: OutboundMessage): void {
    const set = this.listeners.get(message.type);
    if (!set || set.size === 0) {
      let bucket = this.buffered.get(message.type);
      if (!bucket) {
        bucket = [];
        this.buffered.set(message.type, bucket);
      }
      bucket.push(message);
      return;
    }
    for (const listener of set) listener(message);
  }
}
