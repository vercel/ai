import {
  DEFAULT_SPEECH_ENGINE_CAPABILITIES,
  encodeSpeechEngineEvent,
  parseSpeechEngineServerEvent,
  type SpeechEngineCapabilities,
  type SpeechEngineClientEvent,
  type SpeechEngineDescriptor,
  type SpeechEngineServerEvent,
} from './gateway-speech-engine';

/**
 * Minimal socket the session drives. A Node `ws` socket satisfies this; adapt
 * other transports (e.g. a framework's WS peer) to it.
 */
export interface SpeechEngineWebSocketLike {
  send(data: string): void;
  close(): void;
  on(event: 'message', listener: (data: { toString(): string }) => void): void;
  on(event: 'close', listener: (...args: unknown[]) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

/** Context for a `transcript` event; `signal` aborts when a newer turn supersedes it. */
export interface SpeechEngineTranscriptContext {
  itemId?: string;
  signal: AbortSignal;
}

interface SpeechEngineSessionEventMap {
  open: [engine: SpeechEngineDescriptor | undefined];
  transcript: [text: string, context: SpeechEngineTranscriptContext];
  'speech-started': [context: { itemId?: string }];
  interrupted: [];
  closed: [reason: string];
  error: [error: Error];
}

type Listener = (...args: never[]) => void;

/**
 * Controller-side ("brain") session for the Gateway speech-engine control
 * plane: wraps the control socket, surfaces finalized transcripts, and streams
 * reply text back for TTS. A new transcript (or interruption) aborts the prior
 * turn's signal and cancels it on the wire by `turnId` — the same shape as
 * ElevenLabs' `SpeechEngineSession`, generalized to any AI Gateway engine.
 */
export class GatewaySpeechEngineSession {
  readonly #ws: SpeechEngineWebSocketLike;
  readonly #listeners = new Map<string, Set<Listener>>();
  #seq = 0;
  #turnSeq = 0;
  #current: AbortController | undefined;
  #currentTurnId: string | undefined;
  #inTranscript = false;
  #closed = false;
  #sessionId: string | undefined;
  #capabilities: SpeechEngineCapabilities = DEFAULT_SPEECH_ENGINE_CAPABILITIES;

  constructor(ws: SpeechEngineWebSocketLike) {
    this.#ws = ws;
    this.#ws.on('message', data => {
      const event = parseSpeechEngineServerEvent(data.toString());
      if (event !== null) this.#handle(event);
    });
    this.#ws.on('close', () => {
      this.#closed = true;
      this.#abortCurrent();
      this.#emit('closed', 'socket_closed');
    });
    this.#ws.on('error', err => this.#emit('error', err));
  }

  on<E extends keyof SpeechEngineSessionEventMap>(
    event: E,
    listener: (...args: SpeechEngineSessionEventMap[E]) => void,
  ): this {
    const set = this.#listeners.get(event) ?? new Set();
    set.add(listener as Listener);
    this.#listeners.set(event, set);
    return this;
  }

  off<E extends keyof SpeechEngineSessionEventMap>(
    event: E,
    listener: (...args: SpeechEngineSessionEventMap[E]) => void,
  ): this {
    this.#listeners.get(event)?.delete(listener as Listener);
    return this;
  }

  /** Signals readiness so the engine clears its connect/ready timeout. */
  ready(): void {
    this.#emitWire({ type: 'session.ready' });
  }

  /**
   * Streams a reply for the current transcript back to the engine for TTS.
   * Accepts a string or an async iterable of strings / LLM stream chunks
   * (OpenAI / Anthropic / Gemini deltas are auto-extracted). Must be called in
   * response to a `transcript` event.
   */
  async sendResponse(response: string | AsyncIterable<unknown>): Promise<void> {
    if (this.#closed)
      throw new Error('Cannot send response: session is closed');
    if (!this.#inTranscript || this.#current === undefined) return;

    const controller = this.#current;
    const turnId = `turn_${(this.#turnSeq += 1)}`;
    this.#currentTurnId = turnId;
    this.#emitWire({ type: 'turn.started', data: { turnId } });

    try {
      if (typeof response === 'string') {
        if (response.length > 0 && !controller.signal.aborted) {
          this.#emitWire({
            type: 'response.delta',
            data: { text: response, turnId },
          });
        }
      } else {
        for await (const chunk of response) {
          if (controller.signal.aborted || this.#closed) return;
          const text = extractText(chunk);
          if (text)
            this.#emitWire({ type: 'response.delta', data: { text, turnId } });
        }
      }
      if (!controller.signal.aborted && !this.#closed) {
        this.#emitWire({ type: 'response.done', data: { turnId } });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      this.#emit(
        'error',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#abortCurrent();
    this.#ws.close();
  }

  get sessionId(): string | undefined {
    return this.#sessionId;
  }

  get capabilities(): SpeechEngineCapabilities {
    return this.#capabilities;
  }

  get isOpen(): boolean {
    return !this.#closed;
  }

  #handle(event: SpeechEngineServerEvent): void {
    switch (event.type) {
      case 'session.opened':
        this.#sessionId = event.data.sessionId;
        if (event.data.engine)
          this.#capabilities = event.data.engine.capabilities;
        this.#emit('open', event.data.engine);
        return;
      case 'input.transcript.final': {
        this.#supersede();
        const controller = new AbortController();
        this.#current = controller;
        this.#inTranscript = true;
        this.#emit('transcript', event.data.text, {
          signal: controller.signal,
          ...(event.data.itemId !== undefined && { itemId: event.data.itemId }),
        });
        return;
      }
      case 'input.speech.started':
        this.#emit('speech-started', {
          ...(event.data.itemId !== undefined && { itemId: event.data.itemId }),
        });
        return;
      case 'input.interrupted':
        this.#supersede();
        this.#emit('interrupted');
        return;
      case 'session.closed':
        this.#closed = true;
        this.#abortCurrent();
        this.#emit('closed', event.data.reason);
        return;
      case 'error':
        this.#emit('error', new Error(event.data.message));
        return;
      default:
        return;
    }
  }

  // Aborts the in-flight turn and cancels it on the wire by id.
  #supersede(): void {
    if (this.#current !== undefined && !this.#current.signal.aborted) {
      this.#current.abort();
      if (
        this.#currentTurnId !== undefined &&
        this.#capabilities['output.cancel']
      ) {
        this.#emitWire({
          type: 'response.cancel',
          data: { turnId: this.#currentTurnId },
        });
      }
    }
    this.#currentTurnId = undefined;
    this.#inTranscript = false;
  }

  #abortCurrent(): void {
    this.#current?.abort();
    this.#current = undefined;
    this.#inTranscript = false;
  }

  #emitWire(event: SpeechEngineClientEvent): void {
    if (this.#closed && event.type !== 'error') return;
    this.#seq += 1;
    this.#ws.send(encodeSpeechEngineEvent(this.#seq, event));
  }

  #emit<E extends keyof SpeechEngineSessionEventMap>(
    event: E,
    ...args: SpeechEngineSessionEventMap[E]
  ): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      (listener as (...a: SpeechEngineSessionEventMap[E]) => void)(...args);
    }
  }
}

/** Extracts text from a string or common LLM stream chunk shapes. */
function extractText(chunk: unknown): string | null {
  if (typeof chunk === 'string') return chunk;
  if (chunk === null || typeof chunk !== 'object') return null;
  const event = chunk as Record<string, unknown>;

  // AI SDK / OpenAI Responses: { type: 'response.output_text.delta', delta }
  if (
    event.type === 'response.output_text.delta' &&
    typeof event.delta === 'string'
  ) {
    return event.delta;
  }
  // OpenAI Chat Completions: { choices: [{ delta: { content } }] }
  if (Array.isArray(event.choices)) {
    const delta = (event.choices[0] as Record<string, unknown>)?.delta;
    if (isRecord(delta) && typeof delta.content === 'string')
      return delta.content;
  }
  // Anthropic: { type: 'content_block_delta', delta: { type: 'text_delta', text } }
  if (event.type === 'content_block_delta' && isRecord(event.delta)) {
    if (
      event.delta.type === 'text_delta' &&
      typeof event.delta.text === 'string'
    ) {
      return event.delta.text;
    }
  }
  // Gemini: { candidates: [{ content: { parts: [{ text }] } }] }
  if (Array.isArray(event.candidates)) {
    const content = (event.candidates[0] as Record<string, unknown>)?.content;
    if (isRecord(content) && Array.isArray(content.parts)) {
      const part = content.parts[0] as Record<string, unknown>;
      if (typeof part?.text === 'string') return part.text;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
