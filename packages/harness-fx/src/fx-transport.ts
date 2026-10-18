import { createHash } from 'node:crypto';
import { isRecord, secureJsonParse } from '@ai-sdk/provider-utils';
import type { HarnessV1ResponseFormat } from '@ai-sdk/harness';
import type { FxModelRecord, FxTurnState } from './fx-resume-state';
import type { FxProvider } from './fx-subscription';

export type FxGatewayPart = { type: string; [key: string]: unknown };

type FxToolCall = { toolCallId: string; toolName: string; input: unknown };

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
  baseUrl?: string;
  provider?: FxProvider;
  headers: Record<string, string>;
  turn: FxTurnState;
  responseFormat?: HarnessV1ResponseFormat;
  save(): Promise<void>;
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
  const provider = options.provider ?? 'gateway';
  const toolCalls = new Map<number, FxToolCall[]>();

  /*
   * libfx's observation hooks truncate tool arguments, and host executors run
   * sequentially. Read complete calls from the durable response so all inputs
   * can be published before the first executor waits for a host approval.
   */
  function collectToolCalls(input: { record: FxModelRecord; index: number }) {
    const calls = new Map<string, FxToolCall>();
    for (const frame of input.record.body.split(/\r?\n\r?\n/)) {
      const part = parseFxEvent(frame);
      if (
        part?.type === 'tool-call' &&
        part.providerExecuted !== true &&
        typeof part.toolCallId === 'string' &&
        typeof part.toolName === 'string'
      )
        calls.set(part.toolCallId, {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      if (
        (part?.type === 'response.completed' ||
          part?.type === 'response.done') &&
        isRecord(part.response) &&
        (part.response.status == null ||
          part.response.status === 'completed') &&
        Array.isArray(part.response.output)
      ) {
        for (const item of part.response.output) {
          if (
            isRecord(item) &&
            item.type === 'function_call' &&
            typeof item.call_id === 'string' &&
            typeof item.name === 'string'
          )
            calls.set(item.call_id, {
              toolCallId: item.call_id,
              toolName: item.name,
              input: item.arguments,
            });
        }
      }
    }
    toolCalls.set(input.index, [...calls.values()]);
  }

  const wrappedFetch: typeof globalThis.fetch = async (input, init = {}) => {
    if (!active) throw new DOMException('fx turn is suspended.', 'AbortError');
    const originalUrl = new URL(
      input instanceof Request ? input.url : String(input),
    );
    const url = new URL(originalUrl);
    const gatewayRequest =
      provider === 'gateway' &&
      originalUrl.origin === 'https://ai-gateway.vercel.sh';
    if (gatewayRequest) {
      const baseUrl = options.baseUrl ?? 'https://ai-gateway.vercel.sh';
      const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
      url.href = new URL(
        originalUrl.pathname.slice(1) + originalUrl.search,
        base,
      ).href;
    }
    const headers = new Headers(
      init.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (gatewayRequest) {
      for (const [name, value] of Object.entries(options.headers))
        headers.set(name, value);
    }
    const method = (
      init.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const modelRequest =
      provider === 'gateway'
        ? gatewayRequest && originalUrl.pathname.endsWith('/ai/language-model')
        : originalUrl.href.split('?')[0] ===
          (provider === 'codex'
            ? 'https://chatgpt.com/backend-api/codex/responses'
            : 'https://cli-chat-proxy.grok.com/v1/responses');
    if (method !== 'POST' || !modelRequest) {
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
    let body = inputBody;
    if (options.responseFormat?.type === 'json') {
      const parsed = secureJsonParse(inputBody) as Record<string, unknown>;
      const format = options.responseFormat;
      body = JSON.stringify(
        provider === 'gateway'
          ? { ...parsed, responseFormat: format }
          : {
              ...parsed,
              text: {
                ...(isRecord(parsed.text) ? parsed.text : {}),
                format:
                  format.schema == null
                    ? { type: 'json_object' }
                    : {
                        type: 'json_schema',
                        name: format.name ?? 'response',
                        ...(format.description == null
                          ? {}
                          : { description: format.description }),
                        schema: format.schema,
                        strict: true,
                      },
              },
            },
      );
    }
    const modelId =
      provider === 'gateway'
        ? (headers.get('ai-language-model-id') ?? undefined)
        : (secureJsonParse(body) as { model?: string }).model;
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          path: originalUrl.pathname,
          model: headers.get('ai-language-model-id'),
          ...(provider === 'gateway'
            ? {}
            : { provider, origin: originalUrl.origin }),
          body,
        }),
      )
      .digest('hex');
    options.onRequest({
      requestIndex: index,
      modelId,
    });
    const previous = options.turn.models[index];
    if (previous && previous.fingerprint !== fingerprint) {
      throw new Error(
        `fx continuation diverged at model request ${index}. Refusing to replay different work.`,
      );
    }

    if (previous?.complete) {
      if (previous.status < 200 || previous.status >= 300) {
        return new Response(previous.body, { status: previous.status });
      }
      /*
       * Older saved Gateway turns track emitted wire frames rather than
       * parsed output lengths. Convert that cursor once when replaying them.
       */
      if (!previous.emittedOutput) {
        const output = { text: 0, reasoning: 0, finished: false };
        for (const frame of previous.body
          .split(/\r?\n\r?\n/)
          .filter(Boolean)
          .slice(0, previous.emittedParts)) {
          const part = parseFxEvent(frame);
          if (part?.type === 'text-delta')
            output.text += String(part.delta ?? '').length;
          if (part?.type === 'reasoning-delta')
            output.reasoning += String(part.delta ?? '').length;
          if (part?.type === 'finish') output.finished = true;
        }
        previous.emittedOutput = output;
      }
      collectToolCalls({ record: previous, index });
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
      emittedOutput: { text: 0, reasoning: 0 },
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
    /*
     * libfx authorizes subscription requests around this transport. It must
     * receive rejected responses before journaling so it can refresh a token
     * and redact credentials that an upstream error body may repeat.
     */
    if (provider !== 'gateway' && !response.ok) {
      if (previous) options.turn.models[index] = previous;
      else options.turn.models.splice(index, 1);
      requestIndex--;
      await options.save();
      return response;
    }
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
            const terminalPart =
              part?.type === 'finish' ||
              part?.type === 'error' ||
              (provider !== 'gateway' &&
                [
                  'response.completed',
                  'response.done',
                  'response.incomplete',
                  'response.failed',
                ].includes(part?.type ?? ''));
            if (terminalPart) terminal = true;
            if (
              part &&
              (part.type.startsWith('tool-') ||
                terminalPart ||
                (provider !== 'gateway' &&
                  (part.type.startsWith('response.function_call_arguments.') ||
                    (isRecord(part.item) &&
                      part.item.type === 'function_call'))))
            )
              holding = true;
            if (holding) held += frame;
            else {
              await writer.write(encoder.encode(frame));
            }
          }
          if (done) break;
        }
        if (pending.trim())
          throw new Error(
            `${provider === 'gateway' ? 'Gateway' : provider} stream ended with an incomplete event.`,
          );
        if (!terminal)
          throw new Error(
            `${provider === 'gateway' ? 'Gateway' : provider} stream ended before a terminal event.`,
          );
        record.complete = true;
        await options.save();
        collectToolCalls({ record, index });
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
    toolCalls,
    get requestIndex() {
      return requestIndex;
    },
    async stop() {
      active = false;
      await Promise.allSettled([...tasks]);
    },
  };
}
