import type { LanguageModelV4 } from '@ai-sdk/provider';
import { ToolLoopAgent, tool, type ToolLoopAgentSettings } from 'ai';
import { z } from 'zod/v4';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

const model: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  supportedUrls: {},
  async doGenerate() {
    return {
      content: [
        {
          type: 'tool-call',
          toolCallId: 'generate-call',
          toolName: 'test',
          input: '{}',
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage,
      warnings: [],
    };
  },
  async doStream() {
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'stream-call',
            toolName: 'test',
            input: '{}',
          });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
          });
          controller.close();
        },
      }),
    };
  },
};

type FourCallbacks = {
  generateStart: number;
  generateEnd: number;
  streamStart: number;
  streamEnd: number;
};

const emptyCounts = (): FourCallbacks => ({
  generateStart: 0,
  generateEnd: 0,
  streamStart: 0,
  streamEnd: 0,
});

const values = (counts: FourCallbacks) => [
  counts.generateStart,
  counts.generateEnd,
  counts.streamStart,
  counts.streamEnd,
];

async function main() {
  let executed = 0;

  const tools = {
    test: tool({
      inputSchema: z.object({}),
      execute: () => {
        executed++;
        return 'ok';
      },
    }),
  };

  type Tools = typeof tools;

  const createAgent = (
    settings: Partial<
      Pick<
        ToolLoopAgentSettings<never, Tools>,
        'onToolExecutionStart' | 'onToolExecutionEnd'
      >
    > = {},
  ) =>
    new ToolLoopAgent({
      model,
      stopWhen: () => true,
      tools,
      ...settings,
    });

  async function runGenerateAndStream(
    agent: ToolLoopAgent<never, Tools>,
    callbacks: {
      generate: Parameters<typeof agent.generate>[0];
      stream: Parameters<typeof agent.stream>[0];
    },
  ) {
    await agent.generate(callbacks.generate);
    const result = await agent.stream(callbacks.stream);
    await result.consumeStream();
  }

  const legacyOnly = emptyCounts();
  await runGenerateAndStream(createAgent(), {
    generate: {
      prompt: 'call test',
      experimental_onToolCallStart: () => {
        legacyOnly.generateStart++;
      },
      experimental_onToolCallFinish: () => {
        legacyOnly.generateEnd++;
      },
    },
    stream: {
      prompt: 'call test',
      experimental_onToolCallStart: () => {
        legacyOnly.streamStart++;
      },
      experimental_onToolCallFinish: () => {
        legacyOnly.streamEnd++;
      },
    },
  });

  const settingsCallbacks = { start: 0, end: 0 };
  const legacyWithSettings = emptyCounts();
  await runGenerateAndStream(
    createAgent({
      onToolExecutionStart: () => {
        settingsCallbacks.start++;
      },
      onToolExecutionEnd: () => {
        settingsCallbacks.end++;
      },
    }),
    {
      generate: {
        prompt: 'call test',
        experimental_onToolCallStart: () => {
          legacyWithSettings.generateStart++;
        },
        experimental_onToolCallFinish: () => {
          legacyWithSettings.generateEnd++;
        },
      },
      stream: {
        prompt: 'call test',
        experimental_onToolCallStart: () => {
          legacyWithSettings.streamStart++;
        },
        experimental_onToolCallFinish: () => {
          legacyWithSettings.streamEnd++;
        },
      },
    },
  );

  const stablePrecedence = emptyCounts();
  const legacyWhenStableExists = emptyCounts();
  await runGenerateAndStream(createAgent(), {
    generate: {
      prompt: 'call test',
      onToolExecutionStart: () => {
        stablePrecedence.generateStart++;
      },
      experimental_onToolCallStart: () => {
        legacyWhenStableExists.generateStart++;
      },
      onToolExecutionEnd: () => {
        stablePrecedence.generateEnd++;
      },
      experimental_onToolCallFinish: () => {
        legacyWhenStableExists.generateEnd++;
      },
    },
    stream: {
      prompt: 'call test',
      onToolExecutionStart: () => {
        stablePrecedence.streamStart++;
      },
      experimental_onToolCallStart: () => {
        legacyWhenStableExists.streamStart++;
      },
      onToolExecutionEnd: () => {
        stablePrecedence.streamEnd++;
      },
      experimental_onToolCallFinish: () => {
        legacyWhenStableExists.streamEnd++;
      },
    },
  });

  const observation = {
    executed,
    legacyOnly,
    settingsCallbacks,
    legacyWithSettings,
    stablePrecedence,
    legacyWhenStableExists,
  };
  console.log(JSON.stringify(observation));

  if (executed !== 6) {
    throw new Error(
      `REPRO_SETUP_FAILED: expected 6 tool executions, got ${executed}`,
    );
  }

  if (
    settingsCallbacks.start !== 2 ||
    settingsCallbacks.end !== 2 ||
    values(stablePrecedence).some(count => count !== 1) ||
    values(legacyWhenStableExists).some(count => count !== 0)
  ) {
    throw new Error(
      'REPRO_SETUP_FAILED: stable callbacks did not execute with stable-over-legacy precedence',
    );
  }

  if (
    values(legacyOnly).some(count => count !== 1) ||
    values(legacyWithSettings).some(count => count !== 1)
  ) {
    throw new Error(
      'ISSUE_22597_REPRODUCED: ToolLoopAgent skipped legacy tool lifecycle callbacks',
    );
  }
}

await main();
