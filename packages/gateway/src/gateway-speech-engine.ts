/**
 * Shared protocol for the AI Gateway speech-engine control plane: the wire
 * contract a controller (your LLM/agent endpoint) speaks with the Gateway when
 * the Gateway owns the realtime audio loop (STT, TTS, turn-taking) and drives
 * turns over a server-side control socket.
 *
 * This is the single source of truth so the Gateway and any controller (Eve, or
 * any other client wanting ElevenLabs-style "bring your own brain" voice) can't
 * drift. The Gateway is the "speech engine"; the controller is the "brain".
 * Audio never reaches the controller — only finalized transcripts in, reply
 * text out.
 */

/** Subprotocol offered on the control-socket handshake. */
export const GATEWAY_SPEECH_ENGINE_SUBPROTOCOL = 'ai-gateway-speech-engine.v1';

/**
 * Per-session capability hints the engine advertises in `session.opened`. A
 * controller tunes behavior to them (e.g. skip the spoken readout when
 * `output.audio` is false, only promise barge-in the engine can honor). Absent
 * values default permissive for forward compatibility.
 */
export interface SpeechEngineCapabilities {
  'input.transcript.final': boolean;
  'input.transcript.partial': boolean;
  'input.speech.started': boolean;
  'input.interrupted': boolean;
  'output.audio': boolean;
  'output.cancel': boolean;
  'output.exactReadout': boolean;
}

/** Permissive defaults used when the engine omits a capability (or all of `engine`). */
export const DEFAULT_SPEECH_ENGINE_CAPABILITIES: SpeechEngineCapabilities = {
  'input.transcript.final': true,
  'input.transcript.partial': false,
  'input.speech.started': true,
  'input.interrupted': true,
  'output.audio': true,
  'output.cancel': true,
  'output.exactReadout': false,
};

/** The speech engine the Gateway assembled for this session. */
export interface SpeechEngineDescriptor {
  provider: string;
  model: string;
  protocol: string;
  capabilities: SpeechEngineCapabilities;
}

/** Events the engine (Gateway) sends to the controller. */
export type SpeechEngineServerEvent =
  | {
      type: 'session.opened';
      data: { sessionId: string; engine?: SpeechEngineDescriptor };
    }
  | { type: 'input.speech.started'; data: { itemId?: string } }
  | { type: 'input.speech.stopped'; data: { itemId?: string } }
  | { type: 'input.interrupted'; data: Record<string, never> }
  | { type: 'input.transcript.final'; data: { text: string; itemId?: string } }
  | {
      type: 'session.stats';
      data: {
        durationMs: number;
        responseDeltaCount: number;
        transcriptFinalCount: number;
      };
    }
  | { type: 'session.closed'; data: { reason: string } }
  | { type: 'error'; data: { message: string } };

/**
 * Events the controller sends to the engine. `turnId` correlates a turn's
 * lifecycle frames so the engine can drop frames from a superseded turn (after
 * barge-in) by id rather than relying on ordering.
 */
export type SpeechEngineClientEvent =
  | { type: 'session.ready'; data?: Record<string, never> }
  | { type: 'turn.started'; data: { turnId: string } }
  | { type: 'response.delta'; data: { text: string; turnId: string } }
  | { type: 'response.done'; data: { turnId: string } }
  | { type: 'response.cancel'; data: { turnId: string } }
  | { type: 'error'; data: { code?: string; message?: string } };

interface SpeechEngineEnvelope {
  v: 1;
  id: string;
  seq: number;
  type: string;
  data: Record<string, unknown>;
}

/** Serializes a control event into a wire packet string. */
export function encodeSpeechEngineEvent(
  seq: number,
  event: SpeechEngineServerEvent | SpeechEngineClientEvent,
): string {
  const packet: SpeechEngineEnvelope = {
    v: 1,
    id: `evt_${randomId()}`,
    seq,
    type: event.type,
    data: (event.data ?? {}) as Record<string, unknown>,
  };
  return JSON.stringify(packet);
}

/** Parses an engine→controller wire packet, or `null` when malformed. */
export function parseSpeechEngineServerEvent(
  raw: string,
): SpeechEngineServerEvent | null {
  const data = readEnvelopeData(raw);
  if (data === null) return null;
  const record = data.record;
  switch (data.type) {
    case 'session.opened': {
      if (typeof record.sessionId !== 'string') return null;
      const engine = parseEngine(record.engine);
      return {
        type: 'session.opened',
        data: { sessionId: record.sessionId, ...(engine && { engine }) },
      };
    }
    case 'input.speech.started':
      return { type: 'input.speech.started', data: itemIdOnly(record) };
    case 'input.speech.stopped':
      return { type: 'input.speech.stopped', data: itemIdOnly(record) };
    case 'input.interrupted':
      return { type: 'input.interrupted', data: {} };
    case 'input.transcript.final':
      return typeof record.text === 'string'
        ? {
            type: 'input.transcript.final',
            data: { text: record.text, ...itemIdOnly(record) },
          }
        : null;
    case 'session.stats':
      return {
        type: 'session.stats',
        data: {
          durationMs: numberOr(record.durationMs, 0),
          responseDeltaCount: numberOr(record.responseDeltaCount, 0),
          transcriptFinalCount: numberOr(record.transcriptFinalCount, 0),
        },
      };
    case 'session.closed':
      return {
        type: 'session.closed',
        data: {
          reason: typeof record.reason === 'string' ? record.reason : 'unknown',
        },
      };
    case 'error':
      return {
        type: 'error',
        data: {
          message:
            typeof record.message === 'string' ? record.message : 'unknown',
        },
      };
    default:
      return null;
  }
}

/** Parses a controller→engine wire packet, or `null` when malformed. */
export function parseSpeechEngineClientEvent(
  raw: string,
): SpeechEngineClientEvent | null {
  const data = readEnvelopeData(raw);
  if (data === null) return null;
  const record = data.record;
  switch (data.type) {
    case 'session.ready':
      return { type: 'session.ready', data: {} };
    case 'turn.started':
      return typeof record.turnId === 'string'
        ? { type: 'turn.started', data: { turnId: record.turnId } }
        : null;
    case 'response.delta':
      return typeof record.text === 'string' &&
        typeof record.turnId === 'string'
        ? {
            type: 'response.delta',
            data: { text: record.text, turnId: record.turnId },
          }
        : null;
    case 'response.done':
      return typeof record.turnId === 'string'
        ? { type: 'response.done', data: { turnId: record.turnId } }
        : null;
    case 'response.cancel':
      return typeof record.turnId === 'string'
        ? { type: 'response.cancel', data: { turnId: record.turnId } }
        : null;
    case 'error':
      return {
        type: 'error',
        data: {
          ...(typeof record.code === 'string' && { code: record.code }),
          ...(typeof record.message === 'string' && {
            message: record.message,
          }),
        },
      };
    default:
      return null;
  }
}

function readEnvelopeData(
  raw: string,
): { type: string; record: Record<string, unknown> } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.v !== 1 || typeof parsed.type !== 'string') {
    return null;
  }
  return {
    type: parsed.type,
    record: isRecord(parsed.data) ? parsed.data : {},
  };
}

function parseEngine(value: unknown): SpeechEngineDescriptor | undefined {
  if (!isRecord(value)) return undefined;
  const caps = isRecord(value.capabilities) ? value.capabilities : {};
  return {
    provider: typeof value.provider === 'string' ? value.provider : 'unknown',
    model: typeof value.model === 'string' ? value.model : 'unknown',
    protocol: typeof value.protocol === 'string' ? value.protocol : 'unknown',
    capabilities: {
      'input.transcript.final': boolOr(caps['input.transcript.final'], true),
      'input.transcript.partial': boolOr(
        caps['input.transcript.partial'],
        false,
      ),
      'input.speech.started': boolOr(caps['input.speech.started'], true),
      'input.interrupted': boolOr(caps['input.interrupted'], true),
      'output.audio': boolOr(caps['output.audio'], true),
      'output.cancel': boolOr(caps['output.cancel'], true),
      'output.exactReadout': boolOr(caps['output.exactReadout'], false),
    },
  };
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function itemIdOnly(data: Record<string, unknown>): { itemId?: string } {
  return typeof data.itemId === 'string' ? { itemId: data.itemId } : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
