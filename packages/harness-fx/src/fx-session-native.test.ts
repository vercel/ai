import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  secureJsonParse,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { z } from 'zod/v4';
import { createFx } from './fx-harness';
import { createFxRuntime } from './fx-runtime';
import type { FxStoredState } from './fx-resume-state';

function createParallelFixtureContext(input: {
  kind: 'custom' | 'builtin' | 'mixed';
}) {
  const fixtures = [0, 1].map(index =>
    readFileSync(
      new URL(
        `./__fixtures__/gateway-parallel-${input.kind}-${index}.sse.txt`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const files = new Map<string, string>();
  const effects: string[] = [];
  const sandbox = {
    description: 'remote sandbox',
    run: async ({ command }: { command: string }) => {
      let stdout = '';
      if (command === 'pwd') stdout = '/workspace';
      else if (command.includes('"$HOME"'))
        stdout = Buffer.from('/home/sandbox').toString('base64');
      else if (command.startsWith('mv --')) {
        const paths = [...command.matchAll(/'([^']+)'/g)].map(
          match => match[1],
        );
        files.set(paths[1], files.get(paths[0])!);
      } else if (/^printf (PARIS|TOKYO|MIXED)/.test(command)) {
        effects.push(command);
      }
      return { exitCode: 0, stdout, stderr: '' };
    },
    readTextFile: async ({ path }: { path: string }) => files.get(path) ?? null,
    writeTextFile: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      files.set(path, content);
    },
    stop: async () => {},
    destroy: async () => {},
  } as unknown as SandboxSession;
  const requests: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (init?.method === 'GET') {
      return new Response(
        readFileSync(
          new URL('./__fixtures__/gateway-models.json', import.meta.url),
          'utf8',
        ),
      );
    }
    requests.push(
      typeof init?.body === 'string'
        ? init.body
        : Buffer.from(init!.body as Uint8Array).toString('utf8'),
    );
    const fixture = fixtures[requests.length - 1];
    if (!fixture) throw new Error('Unexpected model request.');
    return new Response(fixture);
  });
  vi.stubGlobal('fetch', fetch);
  return { sandbox, files, effects, requests };
}

describe('parallel fx approvals', () => {
  it.each(['allow-all', 'allow-edits'] as const)(
    'echoes an automatic custom result past an earlier pending call with %s',
    async permissionMode => {
      const { sandbox, effects, requests } = createParallelFixtureContext({
        kind: 'mixed',
      });
      const execute = vi.fn(async ({ city }: { city: string }) => ({
        city,
        celsius: 12,
      }));
      const automaticExecute = vi.fn(async ({ city }: { city: string }) => ({
        city,
        celsius: 18,
      }));
      const agent = new HarnessAgent({
        harness: createFx({
          auth: { AI_GATEWAY_API_KEY: 'test-key' },
          backend: 'native',
        }),
        permissionMode,
        tools: {
          weather: { inputSchema: z.object({ city: z.string() }), execute },
          automatic_weather: {
            inputSchema: z.object({ city: z.string() }),
            execute: automaticExecute,
          },
        },
        toolApproval: { weather: 'user-approval' },
      });
      const session = await agent.createSession({ sandboxSession: sandbox });
      try {
        const first = await agent.stream({
          session,
          prompt: 'Run the mixed batch in parallel.',
        });
        const approvals = [];
        const firstResults = [];
        for await (const part of first.stream) {
          if (part.type === 'error') throw part.error;
          if (part.type === 'tool-approval-request') approvals.push(part);
          if (part.type === 'tool-result') firstResults.push(part.toolName);
        }
        expect(approvals.map(part => part.toolCall.toolName)).toEqual(
          permissionMode === 'allow-edits' ? ['bash', 'weather'] : ['weather'],
        );
        expect(firstResults.sort()).toEqual(
          permissionMode === 'allow-edits'
            ? ['automatic_weather']
            : ['automatic_weather', 'bash'],
        );
        expect(execute).not.toHaveBeenCalled();
        expect(automaticExecute).toHaveBeenCalledTimes(1);
        expect(effects).toHaveLength(permissionMode === 'allow-edits' ? 0 : 1);
        const resumeFrom = await session.detach();
        const resumed = await agent.createSession({
          sessionId: session.sessionId,
          sandboxSession: sandbox,
          resumeFrom,
        });
        try {
          const second = await agent.stream({
            session: resumed,
            messages: [
              {
                role: 'assistant',
                content: approvals.flatMap(part => [
                  part.toolCall,
                  {
                    type: 'tool-approval-request' as const,
                    approvalId: part.approvalId,
                    toolCallId: part.toolCall.toolCallId,
                  },
                ]),
              },
              {
                role: 'tool',
                content: approvals.map(part => ({
                  type: 'tool-approval-response' as const,
                  approvalId: part.approvalId,
                  approved: true,
                })),
              },
            ],
          });
          const secondResults = [];
          for await (const part of second.stream) {
            if (part.type === 'error') throw part.error;
            if (part.type === 'tool-result') secondResults.push(part.toolName);
            expect(part.type).not.toBe('tool-approval-request');
          }
          expect(secondResults.sort()).toEqual(
            permissionMode === 'allow-edits'
              ? ['bash', 'weather']
              : ['weather'],
          );
          expect(effects).toEqual(['printf MIXED > mixed.txt']);
          expect(execute).toHaveBeenCalledTimes(1);
          expect(automaticExecute).toHaveBeenCalledTimes(1);
          expect(requests).toHaveLength(2);
        } finally {
          await resumed.destroy();
        }
      } finally {
        await session.destroy();
        vi.unstubAllGlobals();
      }
    },
    30000,
  );

  it.each(['approved', 'denied'] as const)(
    'settles automatic custom-tool decisions without an approval pause (%s)',
    async decision => {
      const { sandbox, requests } = createParallelFixtureContext({
        kind: 'custom',
      });
      const execute = vi.fn(async ({ city }: { city: string }) => ({ city }));
      const agent = new HarnessAgent({
        harness: createFx({
          auth: { AI_GATEWAY_API_KEY: 'test-key' },
          backend: 'native',
        }),
        tools: {
          weather: { inputSchema: z.object({ city: z.string() }), execute },
        },
        toolApproval: { weather: decision },
      });
      const session = await agent.createSession({ sandboxSession: sandbox });
      try {
        const result = await agent.stream({
          session,
          prompt: 'Weather for both cities.',
        });
        const results = [];
        for await (const part of result.stream) {
          if (part.type === 'error') throw part.error;
          if (part.type === 'tool-result') results.push(part.toolCallId);
          if (part.type === 'tool-approval-request')
            expect(part.isAutomatic).toBe(true);
        }
        expect(execute).toHaveBeenCalledTimes(decision === 'approved' ? 2 : 0);
        expect(results).toHaveLength(2);
        expect(requests).toHaveLength(2);
        expect(await result.steps).toHaveLength(2);
      } finally {
        await session.destroy();
        vi.unstubAllGlobals();
      }
    },
    30000,
  );

  it('exposes both custom approvals before either is approved', async () => {
    const { sandbox, requests } = createParallelFixtureContext({
      kind: 'custom',
    });
    const execute = vi.fn(async ({ city }: { city: string }) => ({
      city,
      celsius: 20,
    }));
    const agent = new HarnessAgent({
      harness: createFx({
        auth: { AI_GATEWAY_API_KEY: 'test-key' },
        backend: 'native',
      }),
      tools: {
        weather: { inputSchema: z.object({ city: z.string() }), execute },
      },
      toolApproval: { weather: 'user-approval' },
    });
    const session = await agent.createSession({ sandboxSession: sandbox });
    try {
      const first = await agent.stream({
        session,
        prompt: 'Weather for Paris and Tokyo in parallel.',
      });
      const approvals = [];
      for await (const part of first.stream) {
        if (part.type === 'error') throw part.error;
        if (part.type === 'tool-approval-request') approvals.push(part);
      }
      expect({
        cities: approvals.map(
          part =>
            z.object({ city: z.string() }).parse(part.toolCall.input).city,
        ),
        executions: execute.mock.calls.length,
        requests: requests.length,
      }).toMatchInlineSnapshot(`
        {
          "cities": [
            "Paris",
            "Tokyo",
          ],
          "executions": 0,
          "requests": 1,
        }
      `);
      const second = await agent.stream({
        session,
        messages: [
          {
            role: 'assistant',
            content: approvals.flatMap(part => [
              part.toolCall,
              {
                type: 'tool-approval-request' as const,
                approvalId: part.approvalId,
                toolCallId: part.toolCall.toolCallId,
              },
            ]),
          },
          {
            role: 'tool',
            content: approvals.map(part => ({
              type: 'tool-approval-response' as const,
              approvalId: part.approvalId,
              approved: true,
            })),
          },
        ],
      });
      const results = [];
      for await (const part of second.stream) {
        if (part.type === 'error') throw part.error;
        if (part.type === 'tool-result') results.push(part);
        expect(part.type).not.toBe('tool-approval-request');
      }
      expect(execute).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(requests).toHaveLength(2);
      expect(await first.steps).toHaveLength(1);
      expect(await second.steps).toHaveLength(1);
    } finally {
      await session.destroy();
      vi.unstubAllGlobals();
    }
  }, 30000);

  it('continues legacy state that only exposed the first call of a batch', async () => {
    const { sandbox, files, requests } = createParallelFixtureContext({
      kind: 'custom',
    });
    const harness = createFx({
      auth: { AI_GATEWAY_API_KEY: 'test-key' },
      backend: 'native',
    });
    const start = {
      sandboxSession: sandbox,
      sessionId: 'legacy-parallel',
      sessionWorkDir: '/workspace',
    };
    const opts = {
      model: 'spacexai/grok-4.7',
      skills: [],
      tools: [{ name: 'weather' }],
    };
    const session = await harness.doStart(start);
    const events: HarnessV1StreamPart[] = [];
    let resolveWaiting!: () => void;
    const waiting = new Promise<void>(resolve => {
      resolveWaiting = resolve;
    });
    try {
      const control = await session.doPromptTurn({
        ...opts,
        prompt: 'Weather for Paris and Tokyo.',
        emit: event => {
          events.push(event);
          if (event.type === 'finish-step') resolveWaiting();
        },
      });
      await waiting;
      const calls = events.filter(event => event.type === 'tool-call');
      const continueFrom = await session.doSuspendTurn();
      await control.done;
      const [statePath, content] = [...files.entries()].find(([path]) =>
        path.endsWith('/state.json'),
      )!;
      const stored = secureJsonParse(content) as FxStoredState;
      stored.turn!.tools = stored.turn!.tools.filter(
        record => record.id === calls[0].toolCallId,
      );
      stored.turn!.emittedKeys = stored
        .turn!.emittedKeys.filter(key => key !== `call:${calls[1].toolCallId}`)
        .map(key =>
          key === 'waiting-step:0' ? `waiting:${calls[0].toolCallId}` : key,
        );
      await sandbox.writeTextFile({
        path: statePath,
        content: JSON.stringify(stored),
      });
      const resumed = await harness.doStart({ ...start, continueFrom });
      try {
        const after: HarnessV1StreamPart[] = [];
        let resolveSecond!: () => void;
        const secondWaiting = new Promise<void>(resolve => {
          resolveSecond = resolve;
        });
        const continued = await resumed.doContinueTurn({
          ...opts,
          emit: event => {
            after.push(event);
            if (event.type === 'finish-step') resolveSecond();
          },
        });
        await continued.submitToolResult({
          toolCallId: calls[0].toolCallId,
          output: 'Paris',
        });
        await secondWaiting;
        expect(
          after
            .filter(event => event.type === 'tool-call')
            .map(event => event.toolCallId),
        ).toEqual([calls[1].toolCallId]);
        await continued.submitToolResult({
          toolCallId: calls[1].toolCallId,
          output: 'Tokyo',
        });
        await continued.done;
        expect(requests).toHaveLength(2);
      } finally {
        await resumed.doDestroy();
      }
    } finally {
      await session.doDestroy();
      vi.unstubAllGlobals();
    }
  }, 30000);

  it('persists a later custom result before its callback and consumes it on cold continuation', async () => {
    const { sandbox, files, requests } = createParallelFixtureContext({
      kind: 'custom',
    });
    const harness = createFx({
      auth: { AI_GATEWAY_API_KEY: 'test-key' },
      backend: 'native',
    });
    const start = {
      sandboxSession: sandbox,
      sessionId: 'parallel-custom',
      sessionWorkDir: '/workspace',
    };
    const opts = {
      model: 'spacexai/grok-4.7',
      skills: [],
      tools: [
        {
          name: 'weather',
          inputSchema: {
            type: 'object' as const,
            properties: { city: { type: 'string' as const } },
          },
        },
      ],
    };
    const session = await harness.doStart(start);
    const events: HarnessV1StreamPart[] = [];
    let resolveWaiting!: () => void;
    const waiting = new Promise<void>(resolve => {
      resolveWaiting = resolve;
    });
    try {
      const control = await session.doPromptTurn({
        ...opts,
        prompt: 'Weather for Paris and Tokyo.',
        emit: event => {
          events.push(event);
          if (event.type === 'finish-step') resolveWaiting();
        },
      });
      await waiting;
      const calls = events.filter(event => event.type === 'tool-call');
      expect(calls).toHaveLength(2);
      expect(events.filter(event => event.type === 'finish-step')).toHaveLength(
        1,
      );
      await control.submitToolResult({
        toolCallId: calls[1].toolCallId,
        output: { city: 'Tokyo', celsius: 18 },
        toolResult: {
          type: 'tool-result',
          toolCallId: calls[1].toolCallId,
          toolName: 'weather',
          output: { type: 'text', value: 'TOKYO_MODEL_OUTPUT' },
        },
      });
      expect(
        events
          .filter(event => event.type === 'tool-result')
          .map(event => event.toolCallId),
      ).toEqual([calls[1].toolCallId]);
      const stored = secureJsonParse(
        [...files.entries()].find(([path]) => path.endsWith('/state.json'))![1],
      ) as {
        turn: { tools: Array<{ status: string; result?: { text: string } }> };
      };
      expect(
        stored.turn.tools.map(tool => ({
          status: tool.status,
          result: tool.result?.text,
        })),
      ).toMatchInlineSnapshot(`
        [
          {
            "result": undefined,
            "status": "waiting",
          },
          {
            "result": "TOKYO_MODEL_OUTPUT",
            "status": "completed",
          },
        ]
      `);
      const continueFrom = await session.doSuspendTurn();
      await control.done;
      const resumed = await harness.doStart({ ...start, continueFrom });
      try {
        const after: HarnessV1StreamPart[] = [];
        const continued = await resumed.doContinueTurn({
          ...opts,
          emit: event => {
            after.push(event);
          },
        });
        await continued.submitToolResult({
          toolCallId: calls[0].toolCallId,
          output: { city: 'Paris', celsius: 12 },
        });
        await continued.done;
        expect(requests).toHaveLength(2);
        expect(requests[1]).toContain('TOKYO_MODEL_OUTPUT');
        expect(
          after.filter(
            event =>
              event.type === 'tool-call' ||
              event.type === 'tool-approval-request',
          ),
        ).toEqual([]);
        expect(
          after
            .filter(event => event.type === 'tool-result')
            .map(event => event.toolCallId),
        ).toEqual([calls[0].toolCallId]);
      } finally {
        await resumed.doDestroy();
      }
    } finally {
      await session.doDestroy();
      vi.unstubAllGlobals();
    }
  }, 30000);

  it('collects both built-in approvals and persists a later denial before cold continuation', async () => {
    const { sandbox, files, effects, requests } = createParallelFixtureContext({
      kind: 'builtin',
    });
    const harness = createFx({
      auth: { AI_GATEWAY_API_KEY: 'test-key' },
      backend: 'native',
    });
    const start = {
      sandboxSession: sandbox,
      sessionId: 'parallel-builtin',
      sessionWorkDir: '/workspace',
      permissionMode: 'allow-edits' as const,
    };
    const opts = { model: 'spacexai/grok-4.7', skills: [], tools: [] };
    const session = await harness.doStart(start);
    const events: HarnessV1StreamPart[] = [];
    let resolveWaiting!: () => void;
    const waiting = new Promise<void>(resolve => {
      resolveWaiting = resolve;
    });
    try {
      const control = await session.doPromptTurn({
        ...opts,
        prompt: 'Write Paris and Tokyo in parallel.',
        emit: event => {
          events.push(event);
          if (event.type === 'finish-step') resolveWaiting();
        },
      });
      await waiting;
      expect(
        events
          .filter(
            event =>
              event.type === 'tool-call' ||
              event.type === 'tool-approval-request' ||
              event.type === 'finish-step',
          )
          .map(event => event.type),
      ).toMatchInlineSnapshot(`
        [
          "tool-call",
          "tool-approval-request",
          "tool-call",
          "tool-approval-request",
          "finish-step",
        ]
      `);
      expect(effects).toEqual([]);
      const approvals = events.filter(
        event => event.type === 'tool-approval-request',
      );
      await control.submitToolApproval!({
        approvalId: approvals[1].approvalId,
        approved: false,
        reason: 'Tokyo denied',
      });
      expect(
        [...files.values()].some(content => content.includes('Tokyo denied')),
      ).toBe(true);
      const continueFrom = await session.doSuspendTurn();
      await control.done;
      const resumed = await harness.doStart({ ...start, continueFrom });
      try {
        const after: HarnessV1StreamPart[] = [];
        const continued = await resumed.doContinueTurn({
          ...opts,
          emit: event => {
            after.push(event);
          },
        });
        await continued.submitToolApproval!({
          approvalId: approvals[0].approvalId,
          approved: true,
        });
        await continued.done;
        expect(effects).toMatchInlineSnapshot(`
          [
            "printf PARIS > paris.txt",
          ]
        `);
        expect(requests).toHaveLength(2);
        expect(requests[1]).toContain('Tokyo denied');
        expect(
          after.filter(
            event =>
              event.type === 'tool-call' ||
              event.type === 'tool-approval-request',
          ),
        ).toEqual([]);
        expect(
          after
            .filter(event => event.type === 'tool-result')
            .map(event => ({
              toolName: event.toolName,
              isError: event.isError,
            })),
        ).toMatchInlineSnapshot(`
          [
            {
              "isError": undefined,
              "toolName": "bash",
            },
            {
              "isError": true,
              "toolName": "bash",
            },
          ]
        `);
      } finally {
        await resumed.doDestroy();
      }
    } finally {
      await session.doDestroy();
      vi.unstubAllGlobals();
    }
  }, 30000);
});

describe('stable fx continuation', () => {
  it('accepts a new prompt on the same session after a caller abort', async () => {
    const fixture = readFileSync(
      new URL('./__fixtures__/gateway-1.sse.txt', import.meta.url),
      'utf8',
    );
    const models = readFileSync(
      new URL('./__fixtures__/gateway-models.json', import.meta.url),
      'utf8',
    );
    const files = new Map<string, string>();
    const sandbox = {
      description: 'remote sandbox',
      run: async ({ command }: { command: string }) => {
        let stdout = '';
        if (command === 'pwd') stdout = '/workspace';
        else if (command.includes('"$HOME"'))
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
    let requests = 0;
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response(models);
      requests++;
      return new Response(fixture);
    });
    const agent = new HarnessAgent({
      harness: createFx({
        auth: { AI_GATEWAY_API_KEY: 'test-key' },
        backend: 'native',
      }),
      model: 'anthropic/claude-haiku-4-5',
      activeTools: [],
    });
    const session = await agent.createSession({ sandboxSession: sandbox });
    try {
      const controller = new AbortController();
      const reason = new Error('Stop the first turn');
      const first = await agent.stream({
        session,
        prompt: 'Reply READY.',
        abortSignal: controller.signal,
      });
      const parts = [];
      for await (const part of first.stream) {
        parts.push(part);
        if (part.type === 'text-delta') controller.abort(reason);
      }
      expect(
        parts
          .filter(part => part.type === 'error' || part.type === 'abort')
          .map(part => part.type),
      ).toEqual(['abort']);
      await expect(first.text).rejects.toBe(reason);
      expect(session.hasUnfinishedTurn()).toBe(false);
      const second = await agent.stream({
        session,
        prompt: 'Reply READY again.',
      });
      const retryParts = [];
      for await (const part of second.stream) retryParts.push(part);
      expect(
        retryParts.some(part => part.type === 'error' || part.type === 'abort'),
      ).toBe(false);
      expect(retryParts.some(part => part.type === 'finish')).toBe(true);
      await expect(second.text).resolves.toBe('READY');
      expect(requests).toBe(2);
    } finally {
      await session.destroy();
      vi.unstubAllGlobals();
    }
  }, 30000);

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
