import { safeParseJSON } from '@ai-sdk/provider-utils';
import type {
  RealtimeClientEvent,
  RealtimeModel,
  RealtimeServerEvent,
} from '../types/realtime-model';

/** One codec queue per connection; retired connections cannot deliver late work. */
export class RealtimeEventChannel {
  private active = true;
  private finishing = false;
  private readonly parse: (
    raw: unknown,
  ) => RealtimeServerEvent | RealtimeServerEvent[];
  private incoming = Promise.resolve();
  private outgoing = Promise.resolve();
  private incomingCount = 0;
  private outgoingCount = 0;

  constructor(
    private readonly options: {
      model: RealtimeModel;
      send: (data: unknown) => void;
      onEvent: (event: RealtimeServerEvent) => void | Promise<void>;
      onError: (error: Error) => void;
      maxPending?: number;
    },
  ) {
    this.parse =
      options.model.createServerEventParser?.() ??
      options.model.parseServerEvent.bind(options.model);
  }

  dispose(): void {
    this.active = false;
  }

  /** Stop accepting messages, but deliver already received terminal events. */
  async finish(): Promise<void> {
    this.finishing = true;
    await this.incoming;
    this.dispose();
  }

  send(event: RealtimeClientEvent, shouldSend?: () => boolean): Promise<void> {
    if (!this.active || this.finishing)
      throw new Error('Realtime connection is closed');
    if (this.outgoingCount >= (this.options.maxPending ?? 512)) {
      throw new Error('Realtime outgoing queue is full');
    }
    this.outgoingCount++;
    const operation = this.outgoing.then(async () => {
      if (shouldSend?.() === false) return;
      if (!this.active || this.finishing)
        throw new Error('Realtime connection is closed');
      const data = await this.options.model.serializeClientEvent(event);
      if (shouldSend?.() === false) return;
      if (!this.active || this.finishing)
        throw new Error('Realtime connection is closed');
      if (data != null) this.options.send(data);
    });
    this.outgoing = operation
      .catch(error => {
        if (!this.finishing) this.report(error);
      })
      .finally(() => {
        this.outgoingCount--;
      });
    return operation;
  }

  receive(data: unknown): void {
    if (!this.active || this.finishing) return;
    if (this.incomingCount >= (this.options.maxPending ?? 512)) {
      this.report(new Error('Realtime incoming queue is full'));
      return;
    }
    this.incomingCount++;
    this.incoming = this.incoming
      .then(async () => {
        if (!this.active) return;
        const text =
          typeof data === 'string'
            ? data
            : data instanceof Blob
              ? await data.text()
              : new TextDecoder().decode(data as ArrayBuffer);
        const parsed = await safeParseJSON({ text });
        if (!this.active) return;
        if (!parsed.success)
          throw new Error('Invalid JSON in realtime server message', {
            cause: parsed.error,
          });
        const health = this.options.model.getHealthCheckResponse?.(
          parsed.value,
        );
        if (health != null && !this.finishing) this.options.send(health);
        const result = this.parse(parsed.value);
        for (const event of Array.isArray(result) ? result : [result]) {
          if (!this.active) return;
          await this.options.onEvent(event);
        }
      })
      .catch(error => this.report(error))
      .finally(() => {
        this.incomingCount--;
      });
  }

  private report(error: unknown): void {
    if (!this.active) return;
    try {
      this.options.onError(
        error instanceof Error ? error : new Error(String(error)),
      );
    } catch {
      /* Application callbacks cannot break the codec queue. */
    }
  }
}
