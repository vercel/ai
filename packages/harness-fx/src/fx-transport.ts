import { createHash } from 'node:crypto';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import type { HarnessV1ResponseFormat } from '@ai-sdk/harness';
import type { FxModelRecord, FxTurnState } from './fx-resume-state';

export type FxGatewayPart = { type: string; [key: string]: unknown };

export function parseFxEvent(frame: string): FxGatewayPart | undefined {
  const data = frame
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n');
  if (!data || data === '[DONE]') return undefined;
  return secureJsonParse(data) as FxGatewayPart;
}

export function createFxTransport(options: {
  baseUrl: string;
  headers: Record<string, string>;
  turn: FxTurnState;
  responseFormat?: HarnessV1ResponseFormat;
  save(): Promise<void>;
  onPart(input: {
    part: FxGatewayPart;
    requestIndex: number;
    attempt: number;
    replay: boolean;
    suppress: boolean;
  }): void;
  onRequest(input: { requestIndex: number; modelId?: string }): void;
  beforeRelease(input: {
    requestIndex: number;
    replay: boolean;
  }): void | Promise<void>;
  fetch?: typeof globalThis.fetch;
}) {
  let requestIndex = -1;
  let active = true;
  const tasks = new Set<Promise<void>>();
  const networkFetch = options.fetch ?? globalThis.fetch;

  const wrappedFetch: typeof globalThis.fetch = async (input, init = {}) => {
    if (!active) throw new DOMException('fx turn is suspended.', 'AbortError');
    const originalUrl = new URL(
      input instanceof Request ? input.url : String(input),
    );
    const url = new URL(originalUrl);
    const base = new URL(
      options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`,
    );
    if (originalUrl.origin === 'https://ai-gateway.vercel.sh') {
      url.href = new URL(
        originalUrl.pathname.slice(1) + originalUrl.search,
        base,
      ).href;
    }
    const headers = new Headers(
      init.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    for (const [name, value] of Object.entries(options.headers))
      headers.set(name, value);
    const method = (
      init.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (
      method !== 'POST' ||
      !originalUrl.pathname.endsWith('/ai/language-model')
    ) {
      if (!(input instanceof Request)) {
        return networkFetch(url, { ...init, headers });
      }
      /*
       * Retargeting a Request exposes its body as a stream, which cannot be
       * supplied with keepalive enabled. Restore keepalive through fetch init,
       * where the body is inherited from the Request instead of supplied anew.
       */
      const request = new Request(
        url,
        new Request(input, { keepalive: false }),
      );
      return networkFetch(request, {
        keepalive: input.keepalive,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        ...init,
        headers,
      });
    }
    const index = ++requestIndex;
    const inputBody =
      typeof init.body === 'string'
        ? init.body
        : init.body instanceof Uint8Array
          ? new TextDecoder().decode(init.body)
          : input instanceof Request
            ? await input.clone().text()
            : String(init.body ?? '');
    const body =
      options.responseFormat?.type === 'json'
        ? JSON.stringify({
            ...(secureJsonParse(inputBody) as object),
            responseFormat: options.responseFormat,
          })
        : inputBody;
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          path: originalUrl.pathname,
          model: headers.get('ai-language-model-id'),
          body,
        }),
      )
      .digest('hex');
    options.onRequest({
      requestIndex: index,
      modelId: headers.get('ai-language-model-id') ?? undefined,
    });
    const previous = options.turn.models[index];
    if (previous && previous.fingerprint !== fingerprint) {
      throw new Error(
        `fx continuation diverged at model request ${index}. Refusing to replay different work.`,
      );
    }

    function deliver(input: {
      frame: string;
      record: FxModelRecord;
      replay: boolean;
      partIndex: number;
    }) {
      const part = parseFxEvent(input.frame);
      if (part) {
        options.onPart({
          part,
          requestIndex: index,
          attempt: input.record.attempt,
          replay: input.replay,
          suppress: input.replay && input.partIndex < input.record.emittedParts,
        });
      }
      if (!input.replay || input.partIndex >= input.record.emittedParts) {
        input.record.emittedParts = input.partIndex + 1;
      }
    }

    if (previous?.complete) {
      if (previous.status < 200 || previous.status >= 300) {
        return new Response(previous.body, { status: previous.status });
      }
      let partIndex = 0;
      for (const frame of previous.body.split(/\r?\n\r?\n/)) {
        if (frame)
          deliver({
            frame,
            record: previous,
            replay: true,
            partIndex: partIndex++,
          });
      }
      await options.beforeRelease({ requestIndex: index, replay: true });
      await options.save();
      if (!active)
        throw new DOMException('fx turn is suspended.', 'AbortError');
      return new Response(previous.body, {
        status: previous.status,
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    const record: FxModelRecord = {
      fingerprint,
      body: '',
      status: 200,
      complete: false,
      emittedParts: 0,
      attempt: previous ? previous.attempt + 1 : 0,
    };
    options.turn.models[index] = record;
    await options.save();
    let response: Response;
    try {
      response = await networkFetch(url, {
        ...init,
        method,
        headers,
        body,
      });
    } catch (error) {
      if (previous) options.turn.models[index] = previous;
      else options.turn.models.splice(index, 1);
      requestIndex--;
      await options.save();
      throw error;
    }
    record.status = response.status;
    if (!response.ok || !response.body) {
      record.body = await response.text();
      record.complete = true;
      await options.save();
      return new Response(record.body, {
        status: response.status,
        headers: response.headers,
      });
    }

    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const pump = (async () => {
      let pending = '';
      let holding = false;
      let terminal = false;
      let held = '';
      let partIndex = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (!active)
            throw new DOMException('fx turn is suspended.', 'AbortError');
          const chunk = done
            ? decoder.decode()
            : decoder.decode(value, { stream: true });
          record.body += chunk;
          pending += chunk;
          let match: RegExpMatchArray | null;
          while ((match = pending.match(/\r?\n\r?\n/)) != null) {
            const end = match.index! + match[0].length;
            const frame = pending.slice(0, end);
            pending = pending.slice(end);
            const part = parseFxEvent(frame);
            if (part?.type === 'finish' || part?.type === 'error')
              terminal = true;
            if (
              part &&
              (part.type.startsWith('tool-') ||
                part.type === 'finish' ||
                part.type === 'error')
            )
              holding = true;
            if (holding) held += frame;
            else {
              deliver({ frame, record, replay: false, partIndex });
              await writer.write(encoder.encode(frame));
            }
            partIndex++;
          }
          if (done) break;
        }
        if (pending.trim())
          throw new Error('Gateway stream ended with an incomplete event.');
        if (!terminal)
          throw new Error('Gateway stream ended before a terminal event.');
        record.complete = true;
        await options.save();
        let heldIndex = record.emittedParts;
        for (const frame of held.split(/\r?\n\r?\n/)) {
          if (frame)
            deliver({ frame, record, replay: false, partIndex: heldIndex++ });
        }
        await options.beforeRelease({ requestIndex: index, replay: false });
        await options.save();
        if (!active)
          throw new DOMException('fx turn is suspended.', 'AbortError');
        if (held) await writer.write(encoder.encode(held));
        await writer.close();
      } catch (error) {
        await reader.cancel(error).catch(() => {});
        await writer.abort(error).catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
    })();
    tasks.add(pump);
    void pump.catch(() => {}).finally(() => tasks.delete(pump));
    return new Response(stream.readable, {
      status: response.status,
      headers: response.headers,
    });
  };

  return {
    fetch: wrappedFetch,
    get requestIndex() {
      return requestIndex;
    },
    async stop() {
      active = false;
      await Promise.allSettled([...tasks]);
    },
  };
}
