import { generateId } from '@ai-sdk/provider-utils';
import type {
  RealtimeClientEvent,
  RealtimeServerEvent,
} from '../types/realtime-model';

/** Attempt-local ACK correlation; unresolved commands are never evicted. */
export class RealtimeCommandTracker {
  private readonly pending = new Map<string, { muted?: boolean }>();
  private readonly recent = new Set<string>();

  constructor(
    private readonly sendCommand: (event: RealtimeClientEvent) => Promise<void>,
  ) {}

  validateId(id: string): void {
    if (this.pending.has(id) || this.recent.has(id))
      throw new Error(
        'Realtime command ID was already used; retry with a fresh eventId',
      );
    if (this.pending.size >= 512)
      throw new Error('Too many pending realtime commands');
  }

  private complete(id: string): { muted?: boolean } | undefined {
    const command = this.pending.get(id);
    if (command == null) return;
    this.pending.delete(id);
    this.recent.add(id);
    if (this.recent.size > 4096) {
      const oldest = this.recent.values().next().value;
      if (oldest != null) this.recent.delete(oldest);
    }
    return command;
  }

  send(event: RealtimeClientEvent): Promise<void> {
    const muted =
      event.type === 'input-audio-mute'
        ? true
        : event.type === 'input-audio-unmute'
          ? false
          : undefined;
    if (
      event.type === 'input-audio-mute' ||
      event.type === 'input-audio-unmute'
    )
      event = { ...event, eventId: event.eventId ?? generateId() };
    const id = 'eventId' in event ? event.eventId : undefined;
    if (id != null) {
      this.validateId(id);
      this.pending.set(id, { muted });
    }
    const awaitsAcknowledgement =
      event.type === 'context-append' ||
      event.type === 'session-update' ||
      muted != null;
    try {
      const sent = this.sendCommand(event);
      void sent.then(
        () => {
          if (id != null && !awaitsAcknowledgement) this.complete(id);
        },
        () => {
          if (id != null) this.complete(id);
        },
      );
      return sent;
    } catch (error) {
      if (id != null) this.complete(id);
      throw error;
    }
  }

  receive(event: RealtimeServerEvent): { muted?: boolean } | undefined {
    if (event.type === 'command-acknowledged' && event.clientEventId != null)
      return this.complete(event.clientEventId);
    if (event.type === 'error' && event.clientEventId != null)
      this.complete(event.clientEventId);
  }
}
