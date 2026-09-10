import { generateId, safeParseJSON } from '@ai-sdk/provider-utils';
import type {
  RealtimeClientEvent,
  RealtimeServerEvent,
} from '../types/realtime-model';

type Response = {
  id: string;
  calls: Set<string>;
  outputs: Set<string>;
  pending: Map<string, Promise<void>>;
  commands: Map<string, string>;
  done: boolean;
  continued: boolean;
  version: number;
  status?: string;
};
type Command = {
  muted?: boolean;
  result?: {
    responseId: string;
    callId: string;
    done?: boolean;
    status?: string;
  };
  rejected?: boolean;
};
type Send = (
  event: RealtimeClientEvent,
  shouldSend?: () => boolean,
) => Promise<void>;

// Missing or filtered command ACKs keep pending slots occupied; none are synthesized.
// Lifecycle confirmations are attempt-owned, separate from local command completion.
const commandCompletion: Record<
  Extract<RealtimeClientEvent, { eventId?: string }>['type'],
  'acknowledgement' | 'send'
> = {
  'backend-input-create': 'send',
  'backend-response-create': 'send',
  'backend-tool-result': 'send',
  'context-append': 'acknowledgement',
  'input-audio-append': 'send',
  'input-audio-mute': 'acknowledgement',
  'input-audio-unmute': 'acknowledgement',
  'session-close': 'send',
  'session-start': 'send',
  'session-update': 'acknowledgement',
};

/** Pending commands are never evicted; completed IDs retain bounded retry protection. */
export class RealtimeCommandCoordinator {
  private pending = new Map<string, Command>();
  private recent = new Map<string, Command>();
  private responses = new Map<string, Response>();
  private calls = new Map<string, Response>();
  private recentCalls = new Map<string, string | undefined>();
  private recentResponses = new Set<string>();

  constructor(
    private readonly options: {
      send: Send;
      active: () => boolean;
      autoContinue: boolean;
      onError: (error: unknown) => void;
    },
  ) {}

  private remember<T>(map: Map<string, T>, id: string, value: T): void {
    map.set(id, value);
    if (map.size > 4096) {
      const oldest = map.keys().next().value;
      if (oldest != null) map.delete(oldest);
    }
  }

  private tombstone(set: Set<string>, id: string): void {
    set.add(id);
    if (set.size > 4096) {
      const oldest = set.values().next().value;
      if (oldest != null) set.delete(oldest);
    }
  }

  private reserve(id: string, command: Command): void {
    this.validateId(id);
    this.pending.set(id, command);
  }

  validateId(id: string): void {
    if (this.pending.has(id) || this.recent.has(id))
      throw new Error(
        'Realtime command ID was already used; retry with a fresh eventId',
      );
    if (this.pending.size >= 512)
      throw new Error('Too many pending realtime commands');
  }

  private complete(id: string): Command | undefined {
    const command = this.pending.get(id) ?? this.recent.get(id);
    if (command != null) {
      this.pending.delete(id);
      this.remember(this.recent, id, command);
    }
    return command;
  }

  hasPendingTools(): boolean {
    return [...this.responses.values()].some(group =>
      [...group.calls].some(id => !group.outputs.has(id)),
    );
  }

  hasToolCall(id: string): boolean {
    return this.calls.has(id) || this.recentCalls.has(id);
  }

  send(event: RealtimeClientEvent): Promise<void> {
    if (event.type === 'backend-tool-result') return this.result(event);
    const groups =
      event.type === 'backend-response-create'
        ? [...this.responses.values()].filter(
            group => group.calls.size > 0 && !group.continued,
          )
        : [];
    if (
      groups.some(
        group =>
          !group.done || [...group.calls].some(id => !group.outputs.has(id)),
      )
    )
      throw new Error(
        'Submit pending realtime tool results before requesting a backend response',
      );
    let id = 'eventId' in event ? event.eventId : undefined;
    if (id != null) this.reserve(id, {});
    if (
      event.type === 'input-audio-mute' ||
      event.type === 'input-audio-unmute'
    ) {
      const eventId = id ?? generateId();
      if (id == null) this.reserve(eventId, {});
      this.pending.set(eventId, { muted: event.type === 'input-audio-mute' });
      event = { ...event, eventId };
      id = eventId;
    }
    for (const group of groups) group.continued = true;
    const versions = groups.map(group => group.version);
    const awaitsAcknowledgement =
      'eventId' in event && commandCompletion[event.type] === 'acknowledgement';
    try {
      const sent = this.options.send(
        event,
        event.type !== 'backend-response-create'
          ? undefined
          : () =>
              this.options.active() &&
              groups.every((group, index) => group.version === versions[index]),
      );
      void sent.then(
        () => {
          if (id != null && !awaitsAcknowledgement) this.complete(id);
          groups.forEach((group, index) => {
            if (group.version === versions[index]) this.release(group);
          });
        },
        () => {
          if (id != null) this.complete(id);
          for (const group of groups) group.continued = false;
        },
      );
      return sent;
    } catch (error) {
      if (id != null) this.complete(id);
      for (const group of groups) group.continued = false;
      throw error;
    }
  }

  private response(id: string): Response {
    let group = this.responses.get(id);
    if (group != null) return group;
    if (this.responses.size >= 512)
      throw new Error('Too many pending realtime backend responses');
    group = {
      id,
      calls: new Set(),
      outputs: new Set(),
      pending: new Map(),
      commands: new Map(),
      done: false,
      continued: false,
      version: 0,
    };
    this.responses.set(id, group);
    return group;
  }

  private release(group: Response): void {
    this.responses.delete(group.id);
    this.tombstone(this.recentResponses, group.id);
    for (const id of group.calls) {
      this.calls.delete(id);
      const commandId = group.commands.get(id);
      this.remember(this.recentCalls, id, commandId);
      const command =
        commandId == null
          ? undefined
          : (this.pending.get(commandId) ?? this.recent.get(commandId));
      if (command?.result != null) {
        command.result.done = group.done;
        command.result.status = group.status;
      }
    }
    group.version++;
    group.calls.clear();
    group.outputs.clear();
    group.pending.clear();
    group.commands.clear();
  }

  private result(
    event: Extract<RealtimeClientEvent, { type: 'backend-tool-result' }>,
  ): Promise<void> {
    const group = this.calls.get(event.callId);
    if (group == null) {
      if (this.recentCalls.has(event.callId)) return Promise.resolve();
      throw new Error(`Unknown realtime tool call: ${event.callId}`);
    }
    if (group.outputs.has(event.callId)) return Promise.resolve();
    const pending = group.pending.get(event.callId);
    if (pending != null) return pending;
    const eventId = event.eventId ?? generateId();
    const command: Command = {
      result: { responseId: group.id, callId: event.callId },
    };
    this.reserve(eventId, command);
    group.commands.set(event.callId, eventId);
    let sent: Promise<void>;
    try {
      sent = this.options.send({ ...event, eventId }, () =>
        this.options.active(),
      );
    } catch (error) {
      this.complete(eventId);
      command.rejected = true;
      throw error;
    }
    const submitted = sent.then(
      () => {
        // Tool results have no portable provider ACK; retain late errors in recent history.
        this.complete(eventId);
        if (
          !this.options.active() ||
          command.rejected ||
          group.commands.get(event.callId) !== eventId
        )
          return;
        group.pending.delete(event.callId);
        group.outputs.add(event.callId);
        this.continue(group);
      },
      error => {
        command.rejected = true;
        this.complete(eventId);
        group.pending.delete(event.callId);
        throw error;
      },
    );
    group.pending.set(event.callId, submitted);
    void submitted.catch(() => {});
    return submitted;
  }

  private continue(group: Response): void {
    if (
      !this.options.autoContinue ||
      !this.options.active() ||
      !group.done ||
      group.continued ||
      group.status !== 'completed' ||
      group.calls.size === 0 ||
      [...group.calls].some(id => !group.outputs.has(id))
    )
      return;
    group.continued = true;
    const version = group.version;
    try {
      // Rejection cancels queued continuation; an on-wire continuation cannot be retracted.
      const sent = this.options.send(
        { type: 'backend-response-create' },
        () => this.options.active() && version === group.version,
      );
      void sent.then(
        () => {
          if (version === group.version) this.release(group);
        },
        () => {
          if (version === group.version) group.continued = false;
        },
      );
    } catch (error) {
      group.continued = false;
      this.options.onError(error);
    }
  }

  async receive(event: RealtimeServerEvent): Promise<
    | {
        muted?: boolean;
        tool?: { callId: string; name: string; args: unknown };
      }
    | undefined
  > {
    if (event.type === 'command-acknowledged' && event.clientEventId != null)
      return { muted: this.complete(event.clientEventId)?.muted };
    if (event.type === 'error' && event.clientEventId != null) {
      const command = this.complete(event.clientEventId);
      if (command?.result != null && !command.rejected) {
        command.rejected = true;
        const { responseId, callId, done, status } = command.result;
        const existing = this.responses.get(responseId);
        const latestId =
          existing?.commands.get(callId) ?? this.recentCalls.get(callId);
        if (
          latestId === event.clientEventId &&
          (status == null || status === 'completed')
        ) {
          const group = existing ?? this.response(responseId);
          if (existing == null) {
            group.done = done ?? false;
            group.status = status;
          }
          group.calls.add(callId);
          group.commands.set(callId, event.clientEventId);
          group.outputs.delete(callId);
          group.pending.delete(callId);
          group.continued = false;
          group.version++;
          this.calls.set(callId, group);
        }
      }
    }
    if (!this.options.active()) return;
    switch (event.type) {
      case 'backend-response-created':
        if (!this.recentResponses.has(event.responseId))
          this.response(event.responseId);
        break;
      case 'backend-tool-call': {
        if (
          this.calls.has(event.callId) ||
          this.recentCalls.has(event.callId) ||
          this.recentResponses.has(event.responseId)
        )
          break;
        const group = this.response(event.responseId);
        if (group.done) break;
        if (this.calls.size >= 4096)
          throw new Error('Too many pending realtime backend calls');
        group.calls.add(event.callId);
        this.calls.set(event.callId, group);
        const parsed = await safeParseJSON({ text: event.arguments });
        if (!this.options.active()) break;
        if (!parsed.success)
          this.options.onError(
            new Error(`Invalid arguments for realtime tool ${event.name}`),
          );
        else
          return {
            tool: {
              callId: event.callId,
              name: event.name,
              args: parsed.value,
            },
          };
        break;
      }
      case 'backend-response-done': {
        if (this.recentResponses.has(event.responseId)) break;
        const group = this.response(event.responseId);
        if (group.done) break;
        group.done = true;
        group.status = event.status;
        if (group.calls.size === 0 || group.status !== 'completed')
          this.release(group);
        else this.continue(group);
        break;
      }
    }
  }
}
