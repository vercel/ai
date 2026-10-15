import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  secureJsonParse,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { createFx } from './fx-harness';
import { createFxRuntime } from './fx-runtime';

describe('stable fx continuation', () => {
  it('persists native steering and reapplies it before the next request on cold continuation', async () => {
    const fixtures = [0, 1].map(index =>
      readFileSync(
        new URL(`./__fixtures__/gateway-${index}.sse.txt`, import.meta.url),
        'utf8',
      ),
    );
    const files = new Map<string, string>();
    const sandbox = {
      description: 'remote sandbox',
      run: async ({ command }: { command: string }) => {
        let stdout = '';
        if (command.includes('"$HOME"'))
          stdout = Buffer.from('/home/sandbox').toString('base64');
        else if (command.startsWith('mv --')) {
          const paths = [...command.matchAll(/'([^']+)'/g)].map(
            match => match[1],
          );
          files.set(paths[1], files.get(paths[0])!);
        }
        return { exitCode: 0, stdout, stderr: '' };
      },
      readTextFile: async ({ path }: { path: string }) =>
        files.get(path) ?? null,
      writeTextFile: async ({
        path,
        content,
      }: {
        path: string;
        content: string;
      }) => {
        files.set(path, content);
      },
    } as unknown as SandboxSession;
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(fixtures[0]),
    );
    vi.stubGlobal('fetch', fetch);
    const harness = createFx({
      auth: { AI_GATEWAY_API_KEY: 'test-key' },
      backend: 'native',
    });
    const start = {
      sandboxSession: sandbox,
      sessionId: 'steered-replay',
      sessionWorkDir: '/workspace',
    };
    const opts = {
      model: 'anthropic/claude-haiku-4-5',
      skills: [],
      tools: [{ name: 'bash' }],
    };
    const session = await harness.doStart(start);
    try {
      let waiting!: () => void;
      const pending = new Promise<void>(resolve => {
        waiting = resolve;
      });
      const control = await session.doPromptTurn({
        ...opts,
        prompt:
          'Use bash to run exactly printf LIBFX_FIXTURE. Then reply with READY.',
        emit: event => {
          if (event.type === 'finish-step') waiting();
        },
      });
      await pending;
      await control.submitUserMessage!('After the tool, reply STEERED.');
      const continueFrom = await session.doSuspendTurn();
      await control.done;
      const stored = [...files.entries()].find(([path]) =>
        path.endsWith('/state.json'),
      )![1];
      expect(stored).toContain('After the tool, reply STEERED.');
      let continuedBody = '';
      fetch.mockImplementation(async (_url, init) => {
        continuedBody = Buffer.from(init!.body as Uint8Array).toString('utf8');
        return new Response(fixtures[1]);
      });
      const resumed = await harness.doStart({ ...start, continueFrom });
      try {
        const continued = await resumed.doContinueTurn({ ...opts, emit() {} });
        await continued.submitToolResult({
          toolCallId: 'toolu_01KswTwrpijqi88ffraLQVsY',
          output: 'LIBFX_FIXTURE',
        });
        await continued.done;
        expect(continuedBody).toContain('After the tool, reply STEERED.');
        expect(fetch).toHaveBeenCalledTimes(2);
      } finally {
        await resumed.doDestroy();
      }
    } finally {
      await session.doDestroy();
      vi.unstubAllGlobals();
    }
  }, 30000);

  it('forwards rich tool images into the next Gateway request', async () => {
    const fixtures = [0, 1].map(index =>
      readFileSync(
        new URL(`./__fixtures__/gateway-${index}.sse.txt`, import.meta.url),
        'utf8',
      ),
    );
    const requests: string[] = [];
    const image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const runtime = await createFxRuntime({
      apiKey: 'test-key',
      model: 'anthropic/claude-haiku-4.5',
      backend: 'native',
      tools: [
        {
          name: 'bash',
          description: 'test',
          inputSchema: {
            type: 'object',
            properties: { command: { type: 'string' } },
          },
          execute: async () => ({
            type: 'libfx.tool-result',
            text: 'marker',
            images: [{ type: 'image', mimeType: 'image/png', data: image }],
          }),
        },
      ],
      fetch: async (_url, init) => {
        if (init?.method === 'GET')
          return new Response(
            readFileSync(
              new URL('./__fixtures__/gateway-models.json', import.meta.url),
              'utf8',
            ),
          );
        requests.push(Buffer.from(init!.body as Uint8Array).toString('utf8'));
        return new Response(fixtures[requests.length - 1]);
      },
    });
    try {
      const turn = runtime.prompt('test');
      for await (const _event of turn) {
      }
      await turn.result;
      expect(requests).toHaveLength(2);
      const body = secureJsonParse(requests[1]) as { prompt: unknown[] };
      expect(JSON.stringify(body.prompt)).toContain(image);
      expect(JSON.stringify(body.prompt)).toContain('image/png');
    } finally {
      await runtime.close();
    }
  }, 30000);
  it('replays a completed sandbox effect through a new native runtime without executing it twice', async () => {
    const fixtures = [0, 1].map(index =>
      readFileSync(
        new URL(`./__fixtures__/gateway-${index}.sse.txt`, import.meta.url),
        'utf8',
      ),
    );
    const files = new Map<string, string>();
    let effects = 0;
    const sandbox = {
      description: 'remote sandbox',
      run: async ({ command }: { command: string }) => {
        let stdout = '';
        if (command.includes('"$HOME"'))
          stdout = Buffer.from('/home/sandbox').toString('base64');
        else if (command.startsWith('mv --')) {
          const paths = [...command.matchAll(/'([^']+)'/g)].map(
            match => match[1],
          );
          files.set(paths[1], files.get(paths[0])!);
        } else if (command === 'printf LIBFX_FIXTURE') {
          effects++;
          stdout = 'LIBFX_FIXTURE';
        }
        return { exitCode: 0, stdout, stderr: '' };
      },
      readTextFile: async ({ path }: { path: string }) =>
        files.get(path) ?? null,
      writeTextFile: async ({
        path,
        content,
      }: {
        path: string;
        content: string;
      }) => {
        files.set(path, content);
      },
    } as unknown as SandboxSession;
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(fixtures[0]),
    );
    vi.stubGlobal('fetch', fetch);
    const harness = createFx({
      auth: { AI_GATEWAY_API_KEY: 'test-key' },
      backend: 'native',
    });
    const start = {
      sandboxSession: sandbox,
      sessionId: 'native-replay',
      sessionWorkDir: '/workspace',
    };
    const opts = { model: 'anthropic/claude-haiku-4-5', skills: [], tools: [] };
    const session = await harness.doStart(start);
    try {
      let resolveResult!: () => void;
      const hasResult = new Promise<void>(resolve => {
        resolveResult = resolve;
      });
      let suspended: ReturnType<typeof session.doSuspendTurn> | undefined;
      const events: HarnessV1StreamPart[] = [];
      const control = await session.doPromptTurn({
        ...opts,
        prompt:
          'Use bash to run exactly printf LIBFX_FIXTURE. Then reply with READY.',
        emit: event => {
          events.push(event);
          if (event.type === 'tool-result') {
            suspended = session.doSuspendTurn();
            resolveResult();
          }
        },
      });
      await hasResult;
      const continueFrom = await suspended!;
      await control.done;
      expect(effects).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      fetch.mockImplementation(async () => new Response(fixtures[1]));
      const resumed = await harness.doStart({ ...start, continueFrom });
      const after: HarnessV1StreamPart[] = [];
      try {
        await (
          await resumed.doContinueTurn({
            ...opts,
            emit: event => after.push(event),
          })
        ).done;
        expect(effects).toBe(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(
          after.filter(
            event => event.type === 'tool-call' || event.type === 'tool-result',
          ),
        ).toEqual([]);
        expect(
          after
            .filter(event => event.type === 'text-delta')
            .map(event => event.delta)
            .join(''),
        ).toBe('READY');
        expect(events.find(event => event.type === 'tool-call')).toEqual({
          type: 'tool-call',
          toolCallId: 'toolu_01KswTwrpijqi88ffraLQVsY',
          toolName: 'bash',
          input: '{"command":"printf LIBFX_FIXTURE"}',
          providerExecuted: true,
          nativeName: 'bash',
        });
      } finally {
        await resumed.doDestroy();
      }
    } finally {
      await session.doDestroy();
      vi.unstubAllGlobals();
    }
  }, 30000);
});
