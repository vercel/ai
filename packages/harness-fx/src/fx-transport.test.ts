import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFxTransport } from './fx-transport';
import type { FxTurnState } from './fx-resume-state';
import { createFxTranslator } from './fx-translate';
import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { secureJsonParse } from '@ai-sdk/provider-utils';

const fixture = readFileSync(
  new URL('./__fixtures__/gateway-0.sse.txt', import.meta.url),
  'utf8',
);
function createTurn(): FxTurnState {
  return {
    id: 'test',
    signature: 'test',
    prompt: 'test',
    models: [],
    tools: [],
    emittedKeys: [],
    steers: [],
  };
}
const request = {
  url: 'https://ai-gateway.vercel.sh/v4/ai/language-model',
  init: {
    method: 'POST',
    headers: { 'ai-language-model-id': 'anthropic/claude-haiku-4-5' },
    body: '{"prompt":[]}',
  },
};

describe('fx Gateway transport', () => {
  it('preserves passthrough Request fields when rewriting the Gateway URL', async () => {
    const controller = new AbortController();
    let forwarded!: Request;
    const turn = createTurn();
    const transport = createFxTransport({
      baseUrl: 'https://gateway.example/proxy',
      headers: { 'x-client-app': 'ai-sdk-harness-fx/test' },
      turn,
      save: async () => {},
      onPart() {},
      onRequest() {},
      beforeRelease() {},
      fetch: async (input, init) => {
        forwarded = new Request(input, init);
        return new Response(fixture);
      },
    });
    await transport.fetch(
      new Request('https://ai-gateway.vercel.sh/v4/other?query=value', {
        method: 'POST',
        body: 'request body',
        signal: controller.signal,
        headers: { authorization: 'Bearer test-key' },
        credentials: 'include',
        redirect: 'manual',
        cache: 'no-store',
        referrer: 'https://client.example/',
        referrerPolicy: 'origin',
        integrity: 'sha256-test',
        keepalive: true,
      }),
    );
    expect({
      url: forwarded.url,
      method: forwarded.method,
      body: await forwarded.text(),
      headers: Object.fromEntries(forwarded.headers),
      credentials: forwarded.credentials,
      redirect: forwarded.redirect,
      cache: forwarded.cache,
      referrer: forwarded.referrer,
      referrerPolicy: forwarded.referrerPolicy,
      integrity: forwarded.integrity,
      keepalive: forwarded.keepalive,
    }).toMatchInlineSnapshot(`
      {
        "body": "request body",
        "cache": "no-store",
        "credentials": "include",
        "headers": {
          "authorization": "Bearer test-key",
          "content-type": "text/plain;charset=UTF-8",
          "x-client-app": "ai-sdk-harness-fx/test",
        },
        "integrity": "sha256-test",
        "keepalive": true,
        "method": "POST",
        "redirect": "manual",
        "referrer": "https://client.example/",
        "referrerPolicy": "origin",
        "url": "https://gateway.example/proxy/v4/other?query=value",
      }
    `);
    expect(forwarded.signal.aborted).toBe(false);
    controller.abort();
    expect(forwarded.signal.aborted).toBe(true);
    expect(turn.models).toEqual([]);
    await transport.stop();
  });

  it.each(['request', 'url'] as const)(
    'preserves init overrides for passthrough %s input',
    async inputType => {
      const originalSignal = new AbortController();
      const overrideSignal = new AbortController();
      let forwarded!: Request;
      const transport = createFxTransport({
        baseUrl: 'https://gateway.example',
        headers: { 'x-client-app': 'adapter' },
        turn: createTurn(),
        save: async () => {},
        onPart() {},
        onRequest() {},
        beforeRelease() {},
        fetch: async (input, init) => {
          forwarded = new Request(input, init);
          return new Response(fixture);
        },
      });
      const url = 'https://other.example/resource';
      await transport.fetch(
        inputType === 'request'
          ? new Request(url, {
              method: 'POST',
              body: 'original',
              signal: originalSignal.signal,
              headers: { 'x-original': 'original' },
            })
          : new URL(url),
        {
          method: 'PUT',
          body: 'override',
          signal: overrideSignal.signal,
          headers: { 'x-override': 'override', 'x-client-app': 'caller' },
          credentials: 'omit',
        },
      );
      expect({
        url: forwarded.url,
        method: forwarded.method,
        body: await forwarded.text(),
        headers: Object.fromEntries(forwarded.headers),
        credentials: forwarded.credentials,
      }).toMatchInlineSnapshot(`
        {
          "body": "override",
          "credentials": "omit",
          "headers": {
            "content-type": "text/plain;charset=UTF-8",
            "x-client-app": "adapter",
            "x-override": "override",
          },
          "method": "PUT",
          "url": "https://other.example/resource",
        }
      `);
      originalSignal.abort();
      expect(forwarded.signal.aborted).toBe(false);
      overrideSignal.abort();
      expect(forwarded.signal.aborted).toBe(true);
      await transport.stop();
    },
  );

  it('awaits batch publication before releasing live and replayed tool frames', async () => {
    const turn = createTurn();
    const fetch = vi.fn(async () => new Response(fixture));
    for (const replay of [false, true]) {
      let resolvePublishing!: () => void;
      const publishing = new Promise<void>(resolve => {
        resolvePublishing = resolve;
      });
      let resolveRelease!: () => void;
      const release = new Promise<void>(resolve => {
        resolveRelease = resolve;
      });
      const translator = createFxTranslator({ turnId: 'test', emit() {} });
      const beforeRelease = vi.fn(async () => {
        resolvePublishing();
        await release;
      });
      const transport = createFxTransport({
        baseUrl: 'https://ai-gateway.vercel.sh',
        headers: {},
        turn,
        fetch,
        save: async () => {},
        onPart: translator.onPart,
        onRequest() {},
        beforeRelease,
      });
      let released = false;
      const body = transport
        .fetch(request.url, request.init)
        .then(async response => {
          const text = await response.text();
          released = true;
          return text;
        });
      await publishing;
      expect(released).toBe(false);
      expect(beforeRelease).toHaveBeenCalledWith({ requestIndex: 0, replay });
      expect(
        translator.toolCalls.get(0)?.map(call => ({
          ...call,
          input: secureJsonParse(call.input as string),
        })),
      ).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "command": "printf LIBFX_FIXTURE",
            },
            "toolCallId": "toolu_01KswTwrpijqi88ffraLQVsY",
            "toolName": "bash",
          },
        ]
      `);
      resolveRelease();
      expect((await body).trim()).toBe(fixture.trim());
      await transport.stop();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps request indexes stable when libfx retries a failed fetch', async () => {
    const turn = createTurn();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockImplementation(async () => new Response(fixture));
    const options = {
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save: async () => {},
      onPart() {},
      onRequest() {},
      beforeRelease() {},
      fetch,
    };
    const transport = createFxTransport(options);
    await expect(transport.fetch(request.url, request.init)).rejects.toThrow(
      'fetch failed',
    );
    await (await transport.fetch(request.url, request.init)).text();
    expect(transport.requestIndex).toBe(0);
    expect(turn.models).toHaveLength(1);
    const replay = createFxTransport(options);
    await (await replay.fetch(request.url, request.init)).text();
    expect(fetch).toHaveBeenCalledTimes(2);
    await transport.stop();
    await replay.stop();
  });

  it('records real responses before executable frames and replays without fetching', async () => {
    const turn = createTurn();
    const save = vi.fn(async () => {});
    const fetch = vi.fn(
      async () =>
        new Response(fixture, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    const parts: Array<{ type: string; suppress: boolean }> = [];
    const options = {
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save,
      fetch,
      onPart: (input: { part: { type: string }; suppress: boolean }) => {
        parts.push({ type: input.part.type, suppress: input.suppress });
      },
      onRequest() {},
      beforeRelease() {
        expect(turn.models[0].complete).toBe(true);
        expect(save).toHaveBeenCalled();
      },
    };
    const transport = createFxTransport(options);
    expect(
      (await (await transport.fetch(request.url, request.init)).text()).trim(),
    ).toBe(fixture.trim());
    await transport.stop();
    expect(turn.models[0].complete).toBe(true);
    expect(parts.some(part => part.type === 'tool-call')).toBe(true);
    parts.length = 0;
    const replay = createFxTransport(options);
    expect(await (await replay.fetch(request.url, request.init)).text()).toBe(
      fixture,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(parts.every(part => part.suppress)).toBe(true);
    await replay.stop();
  });

  it('does not publish a tool batch from a response missing its terminal event', async () => {
    const turn = createTurn();
    const translator = createFxTranslator({ turnId: 'test', emit() {} });
    const beforeRelease = vi.fn();
    const transport = createFxTransport({
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save: async () => {},
      onPart: translator.onPart,
      onRequest() {},
      beforeRelease,
      fetch: async () =>
        new Response(
          fixture.slice(0, fixture.indexOf('data: {"type":"finish"')),
        ),
    });
    await expect(
      (await transport.fetch(request.url, request.init)).text(),
    ).rejects.toThrow('before a terminal event');
    expect(beforeRelease).not.toHaveBeenCalled();
    expect(translator.toolCalls.size).toBe(0);
    await transport.stop();
  });

  it('forwards structured output and attribution to the configured Gateway', async () => {
    const fetch = vi.fn(async () => new Response(fixture));
    const responseFormat = {
      type: 'json' as const,
      schema: { type: 'object', properties: { answer: { type: 'string' } } },
    };
    const transport = createFxTransport({
      baseUrl: 'https://gateway.example',
      headers: { 'x-client-app': 'ai-sdk-harness-fx/test' },
      turn: createTurn(),
      responseFormat,
      save: async () => {},
      onPart() {},
      onRequest() {},
      beforeRelease() {},
      fetch,
    });
    await (await transport.fetch(request.url, request.init)).text();
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://gateway.example/v4/ai/language-model');
    expect(new Headers(init.headers).get('x-client-app')).toBe(
      'ai-sdk-harness-fx/test',
    );
    expect(init.body).toBe(JSON.stringify({ prompt: [], responseFormat }));
    await transport.stop();
  });

  it('refuses divergent replay requests', async () => {
    const turn = createTurn();
    const options = {
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save: async () => {},
      onPart() {},
      onRequest() {},
      beforeRelease() {},
      fetch: async () => new Response(fixture),
    };
    const transport = createFxTransport(options);
    await (await transport.fetch(request.url, request.init)).text();
    const replay = createFxTransport(options);
    await expect(
      replay.fetch(request.url, {
        ...request.init,
        body: '{"prompt":["changed"]}',
      }),
    ).rejects.toThrow('continuation diverged');
    await transport.stop();
    await replay.stop();
  });

  it('translates captured text and usage without duplicate output on replay', async () => {
    const textFixture = readFileSync(
      new URL('./__fixtures__/gateway-1.sse.txt', import.meta.url),
      'utf8',
    );
    const turn = createTurn();
    const events: HarnessV1StreamPart[] = [];
    const translator = createFxTranslator({
      turnId: 'test',
      emit: event => events.push(event),
    });
    const options = {
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save: async () => {},
      onPart: translator.onPart,
      onRequest() {},
      beforeRelease() {},
      fetch: async () => new Response(textFixture),
    };
    const transport = createFxTransport(options);
    await (await transport.fetch(request.url, request.init)).text();
    expect(
      events
        .filter(event => event.type === 'text-delta')
        .map(event => event.delta)
        .join(''),
    ).toBe('READY');
    const count = events.length;
    const replay = createFxTransport(options);
    await (await replay.fetch(request.url, request.init)).text();
    expect(events).toHaveLength(count);
    expect(translator.totalUsage().inputTokens.total).toBeGreaterThan(0);
    await transport.stop();
    await replay.stop();
  });

  it('recomputes a response truncated at an event boundary with a new text ID', async () => {
    const textFixture = readFileSync(
      new URL('./__fixtures__/gateway-1.sse.txt', import.meta.url),
      'utf8',
    );
    const partial = textFixture.slice(
      textFixture.indexOf('data:'),
      textFixture.indexOf('data: {"type":"text-end"'),
    );
    const turn = createTurn();
    const events: HarnessV1StreamPart[] = [];
    const translator = createFxTranslator({
      turnId: 'test',
      emit: event => events.push(event),
    });
    const fetch = vi.fn(async () => new Response(partial));
    const options = {
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save: async () => {},
      onPart: translator.onPart,
      onRequest() {},
      beforeRelease() {},
      fetch,
    };
    const transport = createFxTransport(options);
    await expect(
      (await transport.fetch(request.url, request.init)).text(),
    ).rejects.toThrow('before a terminal event');
    await transport.stop();
    expect(turn.models[0].complete).toBe(false);
    fetch.mockImplementation(async () => new Response(textFixture));
    const replay = createFxTransport(options);
    await (await replay.fetch(request.url, request.init)).text();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(turn.models[0].attempt).toBe(1);
    expect(events.filter(event => event.type === 'text-delta')).toEqual([
      { type: 'text-delta', id: 'test:0:0:0', delta: 'READY' },
      { type: 'text-delta', id: 'test:0:1:0', delta: 'READY' },
    ]);
    await replay.stop();
  });
});
