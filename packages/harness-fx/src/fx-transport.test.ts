import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFxTransport, parseFxEvent } from './fx-transport';
import type { FxTurnState } from './fx-resume-state';
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

function responsesFixtures(provider: 'codex' | 'grok'): string[] {
  const lines = readFileSync(
    new URL(
      `./__fixtures__/responses-${provider === 'codex' ? 'openai' : 'xai'}.chunks.txt`,
      import.meta.url,
    ),
    'utf8',
  )
    .trim()
    .split('\n');
  const responses: string[] = [];
  let body = '';
  for (const line of lines) {
    body += `data: ${line}\n\n`;
    if (parseFxEvent(`data: ${line}`)?.type === 'response.completed') {
      responses.push(body);
      body = '';
    }
  }
  return responses;
}

describe('fx subscription Responses transport', () => {
  it.each(['codex', 'grok'] as const)(
    'extracts complete %s tool batches before release and reconstructs them on replay',
    async provider => {
      const fixtures = responsesFixtures(provider);
      const turn = createTurn();
      let fetched = 0;
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () => new Response(fixtures[fetched++]),
      );
      let liveCalls: unknown;
      for (const replay of [false, true]) {
        const transport = createFxTransport({
          provider,
          headers: {},
          turn,
          fetch,
          save: async () => {},
          onRequest() {},
          beforeRelease({ requestIndex }) {
            expect(turn.models[requestIndex].complete).toBe(true);
          },
        });
        for (let index = 0; index < fixtures.length; index++) {
          const response = await transport.fetch(
            provider === 'codex'
              ? 'https://chatgpt.com/backend-api/codex/responses'
              : 'https://cli-chat-proxy.grok.com/v1/responses',
            {
              method: 'POST',
              body: JSON.stringify({ model: 'supplied-model', input: [index] }),
            },
          );
          expect(await response.text()).toBe(fixtures[index]);
        }
        const calls = [...transport.toolCalls.values()].flat().map(call => ({
          toolName: call.toolName,
          input: secureJsonParse(call.input as string),
        }));
        if (replay) expect(calls).toEqual(liveCalls);
        else {
          liveCalls = calls;
          expect(calls).toHaveLength(provider === 'codex' ? 3 : 0);
          if (provider === 'codex')
            expect(calls[0]).toMatchInlineSnapshot(`
            {
              "input": {
                "a": 12,
                "b": 7,
                "op": "add",
              },
              "toolName": "calculator",
            }
          `);
        }
        await transport.stop();
      }
      expect(fetch).toHaveBeenCalledTimes(fixtures.length);
    },
  );

  it('does not journal rejected credentials and reuses the request index after a 401', async () => {
    const fixture = responsesFixtures('codex')[0];
    const turn = createTurn();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('rejected secret', { status: 401 }))
      .mockImplementation(async () => new Response(fixture));
    const transport = createFxTransport({
      provider: 'codex',
      headers: {},
      turn,
      fetch,
      save: async () => {},
      onRequest() {},
      beforeRelease() {},
    });
    const endpoint = 'https://chatgpt.com/backend-api/codex/responses';
    const init = { method: 'POST', body: '{"model":"unchanged"}' };
    expect((await transport.fetch(endpoint, init)).status).toBe(401);
    expect(turn.models).toEqual([]);
    await (await transport.fetch(endpoint, init)).text();
    expect(transport.requestIndex).toBe(0);
    expect(turn.models).toHaveLength(1);
    expect(JSON.stringify(turn)).not.toContain('rejected secret');
    await transport.stop();
  });

  it('keeps subscription tools unpublished when a captured response is truncated', async () => {
    const fixture = responsesFixtures('codex')[0];
    const beforeRelease = vi.fn();
    const transport = createFxTransport({
      provider: 'codex',
      headers: {},
      turn: createTurn(),
      save: async () => {},
      onRequest() {},
      beforeRelease,
      fetch: async () =>
        new Response(
          fixture.slice(
            0,
            fixture.indexOf('data: {"type":"response.completed"'),
          ),
        ),
    });
    await expect(
      (
        await transport.fetch(
          'https://chatgpt.com/backend-api/codex/responses',
          {
            method: 'POST',
            body: '{}',
          },
        )
      ).text(),
    ).rejects.toThrow('before a terminal event');
    expect(beforeRelease).not.toHaveBeenCalled();
    expect(transport.toolCalls.size).toBe(0);
    await transport.stop();
  });

  it('scopes Gateway headers away from subscription, OAuth, and catalog requests', async () => {
    const fixture = responsesFixtures('grok')[0];
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(fixture),
    );
    const transport = createFxTransport({
      provider: 'grok',
      headers: { authorization: 'gateway-key', 'x-client-app': 'gateway' },
      turn: createTurn(),
      fetch,
      responseFormat: { type: 'json', schema: { type: 'object' } },
      save: async () => {},
      onRequest() {},
      beforeRelease() {},
    });
    for (const url of [
      'https://auth.x.ai/oauth2/token',
      'https://api.x.ai/v1/models',
      'https://cli-chat-proxy.grok.com/v1/responses',
    ]) {
      await (
        await transport.fetch(url, {
          method: 'POST',
          headers: { authorization: 'subscription' },
          body: '{"model":"unchanged"}',
        })
      ).text();
    }
    expect(
      fetch.mock.calls.map(([url, init]) => ({
        url: String(url),
        headers: Object.fromEntries(new Headers(init?.headers)),
        body: secureJsonParse(init!.body as string),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "body": {
            "model": "unchanged",
          },
          "headers": {
            "authorization": "subscription",
          },
          "url": "https://auth.x.ai/oauth2/token",
        },
        {
          "body": {
            "model": "unchanged",
          },
          "headers": {
            "authorization": "subscription",
          },
          "url": "https://api.x.ai/v1/models",
        },
        {
          "body": {
            "model": "unchanged",
            "text": {
              "format": {
                "name": "response",
                "schema": {
                  "type": "object",
                },
                "strict": true,
                "type": "json_schema",
              },
            },
          },
          "headers": {
            "authorization": "subscription",
          },
          "url": "https://cli-chat-proxy.grok.com/v1/responses",
        },
      ]
    `);
    await transport.stop();
  });
});

describe('fx Gateway transport', () => {
  it('converts a saved Gateway frame cursor to parsed output lengths on replay', async () => {
    const textFixture = readFileSync(
      new URL('./__fixtures__/gateway-1.sse.txt', import.meta.url),
      'utf8',
    );
    const turn = createTurn();
    const fetch = vi.fn(async () => new Response(textFixture));
    const options = {
      headers: {},
      turn,
      fetch,
      save: async () => {},
      onRequest() {},
      beforeRelease() {},
    };
    const transport = createFxTransport(options);
    await (await transport.fetch(request.url, request.init)).text();
    await transport.stop();
    const record = turn.models[0];
    delete record.emittedOutput;
    record.emittedParts = record.body
      .split(/\r?\n\r?\n/)
      .filter(Boolean).length;
    const replay = createFxTransport(options);
    await (await replay.fetch(request.url, request.init)).text();
    expect(record.emittedOutput).toMatchInlineSnapshot(`
      {
        "finished": true,
        "reasoning": 0,
        "text": 5,
      }
    `);
    expect(fetch).toHaveBeenCalledTimes(1);
    await replay.stop();
  });

  it('preserves passthrough Request fields when rewriting the Gateway URL', async () => {
    const controller = new AbortController();
    let forwarded!: Request;
    const turn = createTurn();
    const transport = createFxTransport({
      baseUrl: 'https://gateway.example/proxy',
      headers: { 'x-client-app': 'ai-sdk-harness-fx/test' },
      turn,
      save: async () => {},
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
            "x-client-app": "caller",
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
        transport.toolCalls.get(0)?.map(call => ({
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
    const options = {
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save,
      fetch,
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
    expect(transport.toolCalls.get(0)).toHaveLength(1);
    const replay = createFxTransport(options);
    expect(await (await replay.fetch(request.url, request.init)).text()).toBe(
      fixture,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(replay.toolCalls).toEqual(transport.toolCalls);
    await replay.stop();
  });

  it('does not publish a tool batch from a response missing its terminal event', async () => {
    const turn = createTurn();
    const beforeRelease = vi.fn();
    const transport = createFxTransport({
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save: async () => {},
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
    expect(transport.toolCalls.size).toBe(0);
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

  it('recomputes a response truncated at an event boundary with a new attempt', async () => {
    const textFixture = readFileSync(
      new URL('./__fixtures__/gateway-1.sse.txt', import.meta.url),
      'utf8',
    );
    const partial = textFixture.slice(
      textFixture.indexOf('data:'),
      textFixture.indexOf('data: {"type":"text-end"'),
    );
    const turn = createTurn();
    const fetch = vi.fn(async () => new Response(partial));
    const options = {
      baseUrl: 'https://ai-gateway.vercel.sh',
      headers: {},
      turn,
      save: async () => {},
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
    expect(turn.models[0].emittedOutput).toEqual({ text: 0, reasoning: 0 });
    await replay.stop();
  });
});
