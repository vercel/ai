import { describe, expect, it } from 'vitest';
import { AgentTUIRunner } from './agent-tui-runner';
import { MockScreen, MockUserInput } from './test/mock-terminal';
import { createDeferred } from './util/deferred';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { simulateReadableStream, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod/v4';

describe('AgentTUIRunner integration', () => {
  it('drives a ToolLoopAgent with mock terminal input and screen snapshots', async () => {
    const screen = new MockScreen({ columns: 54, rows: 14 });
    const userInput = new MockUserInput();
    const weatherResult = createDeferred<{
      city: string;
      temperature: number;
      weather: string;
    }>();
    const agent = new ToolLoopAgent({
      model: createWeatherModel(),
      instructions: 'Use the weather tool when asked about weather.',
      tools: {
        weather: tool({
          description: 'Get the weather in a location',
          inputSchema: z.object({ city: z.string() }),
          async execute({ city }) {
            return await weatherResult.promise.then(result => ({
              ...result,
              city,
            }));
          },
        }),
      },
    });
    const run = new AgentTUIRunner({
      title: 'Weather Agent',
      agent,
      screen,
      userInput,
    }).run();

    try {
      await screen.waitForText('> █');
      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ─────────────────────────────────────┐
        │ Waiting for input...                               │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        └────────────────────────────────────────────────────┘
        ┌ Input ─────────────────────────────────────────────┐
        │ > █                                                │
        └────────────────────────────────────────────────────┘"
      `);

      userInput.type('weather in Berlin');
      await screen.waitForText('> weather in Berlin');
      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ─────────────────────────────────────┐
        │ Waiting for input...                               │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        └────────────────────────────────────────────────────┘
        ┌ Input ─────────────────────────────────────────────┐
        │ > weather in Berlin█                               │
        └────────────────────────────────────────────────────┘"
      `);

      userInput.enter();
      await screen.waitForText('executing');
      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ─────────────────────────────────────┐
        │ ╭ User ──────────────────────────────────────────╮ │
        │ │ weather in Berlin                              │ │
        │ ╰────────────────────────────────────────────────╯ │
        │ ╭ Tool · weather ───────────────────── executing ╮ │
        │ │ Input:                                         │ │
        │ │ {                                              │ │
        │ │   "city": "Berlin"                             │ │
        │ │ }                                              │ │
        │ ╰────────────────────────────────────────────────╯ │
        └────────────────────────────────────────────────────┘
        ┌ Status ────────────────────────────────────────────┐
        │ Executing tools... ↑/↓ · PgUp/PgDn · Esc/Ctrl+C    │
        └────────────────────────────────────────────────────┘"
      `);

      weatherResult.resolve({
        city: 'Berlin',
        temperature: 72,
        weather: 'sunny',
      });
      await screen.waitForText('Berlin is sunny and 72F.');
      await screen.waitForText('┌ Input');
      expect(normalizeTokensPerSecond(screen.snapshot()))
        .toMatchInlineSnapshot(`
          "┌ Weather Agent ────────────────────────── 13 tokens ┐
          │ ╭ User ──────────────────────────────────────────╮ │
          │ │ weather in Berlin                              │ │
          │ ╰────────────────────────────────────────────────╯ │
          │ ╭ Tool · weather ────────────────────────── done ╮ │
          │ ╰────────────────────────────────────────────────╯ │
          │ ╭ Assistant ─ tok/s ╮ │
          │ │ Berlin is sunny and 72F.                       │ │
          │ ╰────────────────────────────────────────────────╯ │
          │                                                    │
          └────────────────────────────────────────────────────┘
          ┌ Input ─────────────────────────────────────────────┐
          │ > █                                                │
          └────────────────────────────────────────────────────┘"
        `);

      screen.resize(64, 16);
      await screen.waitForText('┌ Weather Agent');
      expect(normalizeTokensPerSecond(screen.snapshot()))
        .toMatchInlineSnapshot(`
          "┌ Weather Agent ──────────────────────────────────── 13 tokens ┐
          │ ╭ User ────────────────────────────────────────────────────╮ │
          │ │ weather in Berlin                                        │ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │ ╭ Tool · weather ──────────────────────────────────── done ╮ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │ ╭ Assistant ─ tok/s ╮ │
          │ │ Berlin is sunny and 72F.                                 │ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │                                                              │
          │                                                              │
          │                                                              │
          └──────────────────────────────────────────────────────────────┘
          ┌ Input ───────────────────────────────────────────────────────┐
          │ > █                                                          │
          └──────────────────────────────────────────────────────────────┘"
        `);
    } finally {
      userInput.ctrlC();
      await run;
    }
  });

  it('keeps streaming until reasoning after tool execution finishes with text', async () => {
    const screen = new MockScreen({ columns: 72, rows: 24 });
    const userInput = new MockUserInput();
    const weatherResult = createDeferred<{
      city: string;
      temperature: number;
      weather: string;
    }>();
    const finalResponse = createDeferred<void>();
    const agent = new ToolLoopAgent({
      model: createReasoningWeatherModel(finalResponse.promise),
      instructions: 'Use the weather tool when asked about weather.',
      tools: {
        weather: tool({
          description: 'Get the weather in a location',
          inputSchema: z.object({ city: z.string() }),
          async execute({ city }) {
            return await weatherResult.promise.then(result => ({
              ...result,
              city,
            }));
          },
        }),
      },
    });
    const run = new AgentTUIRunner({
      title: 'Weather Agent',
      agent,
      screen,
      userInput,
    }).run();

    try {
      await screen.waitForText('> █');

      userInput.type('weather in Berlin');
      userInput.enter();
      await screen.waitForText('Checking whether weather data is needed.');
      await screen.waitForText('executing');

      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ───────────────────────────────────────────────────────┐
        │ ╭ User ────────────────────────────────────────────────────────────╮ │
        │ │ weather in Berlin                                                │ │
        │ ╰──────────────────────────────────────────────────────────────────╯ │
        │ ╭ Reasoning ·······················································╮ │
        │ ╰··································································╯ │
        │ ╭ Tool · weather ─────────────────────────────────────── executing ╮ │
        │ │ Input:                                                           │ │
        │ │ {                                                                │ │
        │ │   "city": "Berlin"                                               │ │
        │ │ }                                                                │ │
        │ ╰──────────────────────────────────────────────────────────────────╯ │
        │                                                                      │
        │                                                                      │
        │                                                                      │
        │                                                                      │
        │                                                                      │
        │                                                                      │
        │                                                                      │
        │                                                                      │
        └──────────────────────────────────────────────────────────────────────┘
        ┌ Status ──────────────────────────────────────────────────────────────┐
        │ Executing tools... ↑/↓ · PgUp/PgDn · Esc/Ctrl+C                      │
        └──────────────────────────────────────────────────────────────────────┘"
      `);

      weatherResult.resolve({
        city: 'Berlin',
        temperature: 72,
        weather: 'sunny',
      });
      await screen.waitForText('"weather": "sunny"');

      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ───────────────────────────────────────────────────────┐
        │ ╭ User ────────────────────────────────────────────────────────────╮ │
        │ │ weather in Berlin                                                │ │
        │ ╰──────────────────────────────────────────────────────────────────╯ │
        │ ╭ Reasoning ·······················································╮ │
        │ ╰··································································╯ │
        │ ╭ Tool · weather ──────────────────────────────────────────── done ╮ │
        │ │ Input:                                                           │ │
        │ │ {                                                                │ │
        │ │   "city": "Berlin"                                               │ │
        │ │ }                                                                │ │
        │ │                                                                  │ │
        │ │ Output:                                                          │ │
        │ │ {                                                                │ │
        │ │   "city": "Berlin",                                              │ │
        │ │   "temperature": 72,                                             │ │
        │ │   "weather": "sunny"                                             │ │
        │ │ }                                                                │ │
        │ ╰──────────────────────────────────────────────────────────────────╯ │
        │                                                                      │
        └──────────────────────────────────────────────────────────────────────┘
        ┌ Status ──────────────────────────────────────────────────────────────┐
        │ Processing tool results... ↑/↓ · PgUp/PgDn · Esc/Ctrl+C              │
        └──────────────────────────────────────────────────────────────────────┘"
      `);

      finalResponse.resolve();
      await screen.waitForText('Composing the final weather answer.');
      await screen.waitForText('Berlin is sunny and 72F.');
      await screen.waitForText('┌ Input');

      expect(normalizeTokensPerSecond(screen.snapshot()))
        .toMatchInlineSnapshot(`
          "┌ Weather Agent ──────────────────────────────────────────── 13 tokens ┐
          │ ╭ User ────────────────────────────────────────────────────────────╮ │
          │ │ weather in Berlin                                                │ │
          │ ╰──────────────────────────────────────────────────────────────────╯ │
          │ ╭ Reasoning ·······················································╮ │
          │ ╰··································································╯ │
          │ ╭ Tool · weather ──────────────────────────────────────────── done ╮ │
          │ ╰──────────────────────────────────────────────────────────────────╯ │
          │ ╭ Reasoning ·······················································╮ │
          │ ╰··································································╯ │
          │ ╭ Assistant ─ tok/s ╮ │
          │ │ Berlin is sunny and 72F.                                         │ │
          │ ╰──────────────────────────────────────────────────────────────────╯ │
          │                                                                      │
          │                                                                      │
          │                                                                      │
          │                                                                      │
          │                                                                      │
          │                                                                      │
          │                                                                      │
          └──────────────────────────────────────────────────────────────────────┘
          ┌ Input ───────────────────────────────────────────────────────────────┐
          │ > █                                                                  │
          └──────────────────────────────────────────────────────────────────────┘"
        `);
    } finally {
      finalResponse.resolve();
      userInput.ctrlC();
      await run;
    }
  });

  it('trims assistant text and does not render whitespace-only reasoning', async () => {
    const screen = new MockScreen({ columns: 72, rows: 12 });
    const userInput = new MockUserInput();
    const agent = new ToolLoopAgent({
      model: createWhitespaceModel(),
    });
    const run = new AgentTUIRunner({
      title: 'Test Agent',
      agent,
      screen,
      userInput,
    }).run();

    try {
      await screen.waitForText('> █');

      userInput.type('hello');
      userInput.enter();
      await screen.waitForText('Hello! How can I help you today?');
      await screen.waitForText('┌ Input');

      expect(normalizeTokensPerSecond(screen.snapshot()))
        .toMatchInlineSnapshot(`
        "┌ Test Agent ─────────────────────────────────────────────── 13 tokens ┐
        │ ╭ User ────────────────────────────────────────────────────────────╮ │
        │ │ hello                                                            │ │
        │ ╰──────────────────────────────────────────────────────────────────╯ │
        │ ╭ Assistant ─ tok/s ╮ │
        │ │ Hello! How can I help you today?                                 │ │
        │ ╰──────────────────────────────────────────────────────────────────╯ │
        │                                                                      │
        └──────────────────────────────────────────────────────────────────────┘
        ┌ Input ───────────────────────────────────────────────────────────────┐
        │ > █                                                                  │
        └──────────────────────────────────────────────────────────────────────┘"
      `);
      expect(screen.snapshot()).not.toContain('Reasoning');
    } finally {
      userInput.ctrlC();
      await run;
    }
  });

  describe('tool approval', () => {
    it('shows the input of the tool call that each approval decision applies to', async () => {
      const screen = new MockScreen({ columns: 64, rows: 24 });
      const userInput = new MockUserInput();
      const executedInputs: RecordInput[] = [];
      const run = new AgentTUIRunner({
        title: 'Record Agent',
        agent: createRecordAgent({
          toolCalls: [
            {
              toolName: 'record',
              input: { action: 'delete', id: 'customers' },
            },
            { toolName: 'record', input: { action: 'read', id: 'status' } },
          ],
          executedInputs,
        }),
        screen,
        userInput,
      }).run();

      try {
        await screen.waitForText('> █');
        userInput.type('check the status');
        userInput.enter();

        await screen.waitForText('approve? y/n');
        expect(screen.snapshot()).toMatchInlineSnapshot(`
          "┌ Record Agent ───────────────────────────────────── 13 tokens ┐
          │ ╭ User ────────────────────────────────────────────────────╮ │
          │ │ check the status                                         │ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │ ╭ Tool · record ───────────────────────────── approve? y/n ╮ │
          │ │ Input:                                                   │ │
          │ │ {                                                        │ │
          │ │   "action": "delete",                                    │ │
          │ │   "id": "customers"                                      │ │
          │ │ }                                                        │ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │ ╭ Tool · record ─────────────────────── approval requested ╮ │
          │ │ Input:                                                   │ │
          │ │ {                                                        │ │
          │ │   "action": "read",                                      │ │
          │ │   "id": "status"                                         │ │
          │ │ }                                                        │ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │                                                              │
          │                                                              │
          └──────────────────────────────────────────────────────────────┘
          ┌ Status ──────────────────────────────────────────────────────┐
          │ Approve tool record? y/n · ↑/↓ · PgUp/PgDn · Esc/Ctrl+C      │
          └──────────────────────────────────────────────────────────────┘"
        `);

        userInput.type('n');
        await screen.waitForText('approve? y/n');
        expect(screen.snapshot()).toMatchInlineSnapshot(`
          "┌ Record Agent ───────────────────────────────────── 13 tokens ┐
          │ ╭ User ────────────────────────────────────────────────────╮ │
          │ │ check the status                                         │ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │ ╭ Tool · record ─────────────────────────────────── denied ╮ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │ ╭ Tool · record ───────────────────────────── approve? y/n ╮ │
          │ │ Input:                                                   │ │
          │ │ {                                                        │ │
          │ │   "action": "read",                                      │ │
          │ │   "id": "status"                                         │ │
          │ │ }                                                        │ │
          │ ╰──────────────────────────────────────────────────────────╯ │
          │                                                              │
          │                                                              │
          │                                                              │
          │                                                              │
          │                                                              │
          │                                                              │
          │                                                              │
          └──────────────────────────────────────────────────────────────┘
          ┌ Status ──────────────────────────────────────────────────────┐
          │ Approve tool record? y/n · ↑/↓ · PgUp/PgDn · Esc/Ctrl+C      │
          └──────────────────────────────────────────────────────────────┘"
        `);

        userInput.type('y');
        await screen.waitForText('The status is fine.');
        await screen.waitForText('┌ Input');

        expect(executedInputs).toEqual([{ action: 'read', id: 'status' }]);
      } finally {
        userInput.ctrlC();
        await run;
      }
    });

    it.each([
      {
        name: 'two calls of the same tool, approving only the first call',
        toolCalls: [
          { toolName: 'record', input: { action: 'delete', id: 'customers' } },
          { toolName: 'record', input: { action: 'read', id: 'status' } },
        ],
        prompt: 'Approve tool record? y/n',
        decisions: ['y', 'n'],
        executedInputs: [{ action: 'delete', id: 'customers' }],
      },
      {
        name: 'two tools with the same title, approving only the second call',
        toolCalls: [
          {
            toolName: 'deleteRecord',
            input: { action: 'delete', id: 'customers' },
          },
          { toolName: 'readRecord', input: { action: 'read', id: 'status' } },
        ],
        prompt: 'Approve tool Record? y/n',
        decisions: ['n', 'y'],
        executedInputs: [{ action: 'read', id: 'status' }],
      },
    ] as const)(
      'marks the tool call awaiting the decision for $name',
      async ({ toolCalls, prompt, decisions, executedInputs }) => {
        const screen = new MockScreen({ columns: 64, rows: 24 });
        const userInput = new MockUserInput();
        const actualExecutedInputs: RecordInput[] = [];
        const run = new AgentTUIRunner({
          title: 'Record Agent',
          agent: createRecordAgent({
            toolCalls,
            executedInputs: actualExecutedInputs,
          }),
          screen,
          userInput,
        }).run();

        try {
          await screen.waitForText('> █');
          userInput.type('check the status');
          userInput.enter();

          for (const [index, decision] of decisions.entries()) {
            const otherIndex = index === 0 ? 1 : 0;

            await screen.waitForText('approve? y/n');

            const section = sectionAwaitingApproval(screen.snapshot());
            expect(screen.snapshot()).toContain(prompt);
            expect(section).toContain(
              `"action": "${toolCalls[index].input.action}"`,
            );
            expect(section).not.toContain(
              `"action": "${toolCalls[otherIndex].input.action}"`,
            );

            userInput.type(decision);
          }

          await screen.waitForText('The status is fine.');
          await screen.waitForText('┌ Input');

          expect(actualExecutedInputs).toEqual(executedInputs);
        } finally {
          userInput.ctrlC();
          await run;
        }
      },
    );

    it.each(['collapsed', 'hidden'] as const)(
      'shows the input of the tool call awaiting the decision when tools are %s',
      async tools => {
        const screen = new MockScreen({ columns: 64, rows: 24 });
        const userInput = new MockUserInput();
        const executedInputs: RecordInput[] = [];
        const run = new AgentTUIRunner({
          title: 'Record Agent',
          agent: createRecordAgent({
            toolCalls: [
              {
                toolName: 'record',
                input: { action: 'delete', id: 'customers' },
              },
            ],
            executedInputs,
          }),
          tools,
          screen,
          userInput,
        }).run();

        try {
          await screen.waitForText('> █');
          userInput.type('check the status');
          userInput.enter();

          await screen.waitForText('approve? y/n');
          expect(sectionAwaitingApproval(screen.snapshot())).toContain(
            '"action": "delete"',
          );

          userInput.type('y');
          await screen.waitForText('The status is fine.');
          await screen.waitForText('┌ Input');

          expect(executedInputs).toEqual([
            { action: 'delete', id: 'customers' },
          ]);
          expect(screen.snapshot()).not.toContain('"action": "delete"');
          expect(screen.snapshot().includes('Tool · record')).toBe(
            tools === 'collapsed',
          );
        } finally {
          userInput.ctrlC();
          await run;
        }
      },
    );
  });
});

type RecordInput = { action: string; id: string };

function sectionAwaitingApproval(snapshot: string) {
  const lines = snapshot.split('\n');
  const start = lines.findIndex(line => line.includes('approve? y/n'));
  const end = lines.findIndex(
    (line, index) => index > start && line.includes('╰'),
  );

  return lines.slice(start, end + 1).join('\n');
}

function createRecordAgent({
  toolCalls,
  executedInputs,
}: {
  toolCalls: ReadonlyArray<{
    toolName: 'record' | 'deleteRecord' | 'readRecord';
    input: RecordInput;
  }>;
  executedInputs: RecordInput[];
}) {
  const createRecordTool = (title?: string) =>
    tool({
      title,
      description: 'Read or change a record',
      inputSchema: z.object({ action: z.string(), id: z.string() }),
      execute(input) {
        executedInputs.push(input);
        return { ok: true };
      },
    });
  let callCount = 0;

  return new ToolLoopAgent({
    model: new MockLanguageModelV4({
      doStream: async () => {
        callCount += 1;

        const chunks: LanguageModelV4StreamPart[] =
          callCount === 1
            ? [
                { type: 'stream-start', warnings: [] },
                ...toolCalls.map(({ toolName, input }, index) => ({
                  type: 'tool-call' as const,
                  toolCallId: `call-${index + 1}`,
                  toolName,
                  input: JSON.stringify(input),
                })),
                {
                  ...finishChunk(),
                  finishReason: { unified: 'tool-calls', raw: undefined },
                },
              ]
            : [
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 'text-1' },
                {
                  type: 'text-delta',
                  id: 'text-1',
                  delta: 'The status is fine.',
                },
                { type: 'text-end', id: 'text-1' },
                finishChunk(),
              ];

        return {
          stream: simulateReadableStream({
            chunks,
            chunkDelayInMs: null,
            initialDelayInMs: null,
          }),
        };
      },
    }),
    tools: {
      record: createRecordTool(),
      deleteRecord: createRecordTool('Record'),
      readRecord: createRecordTool('Record'),
    },
    toolApproval: {
      record: 'user-approval',
      deleteRecord: 'user-approval',
      readRecord: 'user-approval',
    },
  });
}

function normalizeTokensPerSecond(snapshot: string) {
  return snapshot.replace(
    /│ ╭ Assistant ─+ [\d,.]+ tok\/s ╮ │/g,
    '│ ╭ Assistant ─ tok/s ╮ │',
  );
}

function createWeatherModel() {
  let callCount = 0;

  return new MockLanguageModelV4({
    doStream: async () => {
      callCount += 1;

      if (callCount === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              {
                type: 'response-metadata',
                id: 'response-1',
                modelId: 'mock-model',
                timestamp: new Date(0),
              },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'weather',
                input: '{ "city": "Berlin" }',
              },
              {
                ...finishChunk(),
                finishReason: { unified: 'tool-calls', raw: undefined },
              },
            ],
            chunkDelayInMs: null,
            initialDelayInMs: null,
          }),
        };
      }

      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            {
              type: 'response-metadata',
              id: 'response-2',
              modelId: 'mock-model',
              timestamp: new Date(0),
            },
            { type: 'text-start', id: 'text-1' },
            {
              type: 'text-delta',
              id: 'text-1',
              delta: 'Berlin is sunny and 72F.',
            },
            { type: 'text-end', id: 'text-1' },
            finishChunk(),
          ],
          chunkDelayInMs: null,
          initialDelayInMs: null,
        }),
      };
    },
  });
}

function createReasoningWeatherModel(finalResponse: Promise<void>) {
  let callCount = 0;

  return new MockLanguageModelV4({
    doStream: async () => {
      callCount += 1;

      if (callCount === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              {
                type: 'response-metadata',
                id: 'response-1',
                modelId: 'mock-model',
                timestamp: new Date(0),
              },
              { type: 'reasoning-start', id: 'reasoning-1' },
              {
                type: 'reasoning-delta',
                id: 'reasoning-1',
                delta: 'Checking whether weather data is needed.',
              },
              { type: 'reasoning-end', id: 'reasoning-1' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'weather',
                input: '{ "city": "Berlin" }',
              },
              {
                ...finishChunk(),
                finishReason: { unified: 'tool-calls', raw: undefined },
              },
            ],
            chunkDelayInMs: null,
            initialDelayInMs: null,
          }),
        };
      }

      return {
        stream: new ReadableStream({
          async start(controller) {
            await finalResponse;

            const chunks: LanguageModelV4StreamPart[] = [
              { type: 'stream-start', warnings: [] },
              {
                type: 'response-metadata',
                id: 'response-2',
                modelId: 'mock-model',
                timestamp: new Date(0),
              },
              { type: 'reasoning-start', id: 'reasoning-2' },
              {
                type: 'reasoning-delta',
                id: 'reasoning-2',
                delta: 'Composing the final weather answer.',
              },
              { type: 'reasoning-end', id: 'reasoning-2' },
              { type: 'text-start', id: 'text-1' },
              {
                type: 'text-delta',
                id: 'text-1',
                delta: 'Berlin is sunny and 72F.',
              },
              { type: 'text-end', id: 'text-1' },
              finishChunk(),
            ];

            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }

            controller.close();
          },
        }),
      };
    },
  });
}

function createWhitespaceModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          {
            type: 'response-metadata',
            id: 'response-1',
            modelId: 'mock-model',
            timestamp: new Date(0),
          },
          { type: 'reasoning-start', id: 'reasoning-1' },
          {
            type: 'reasoning-delta',
            id: 'reasoning-1',
            delta: '\n\n   \t  ',
          },
          { type: 'reasoning-end', id: 'reasoning-1' },
          { type: 'text-start', id: 'text-1' },
          {
            type: 'text-delta',
            id: 'text-1',
            delta: '\n\n  Hello! How can I help you today?  \n\n',
          },
          { type: 'text-end', id: 'text-1' },
          finishChunk(),
        ],
        chunkDelayInMs: null,
        initialDelayInMs: null,
      }),
    }),
  });
}

function finishChunk() {
  return {
    type: 'finish' as const,
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: {
      inputTokens: {
        total: 3,
        noCache: 3,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 10,
        text: 10,
        reasoning: undefined,
      },
    },
    providerMetadata: {},
  };
}
