import type { LanguageModelV4ToolCall } from '@ai-sdk/provider';
import { generateText, stepCountIs, streamText, tool, ToolLoopAgent } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

type Api = 'generateText' | 'streamText' | 'ToolLoopAgent.stream';

type Scenario = {
  name: string;
  originalToolName: string;
  originalInput: string;
  repairedToolName?: 'countItems';
  repairedInput?: string;
  expectedRepairCalls: number;
  expectedEvents: string[];
};

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

const finishReason = { unified: 'tool-calls', raw: 'tool_calls' } as const;

const scenarios: Scenario[] = [
  {
    name: 'repairs an existing tool name',
    originalToolName: 'lookupCity',
    originalInput: '{"count":3}',
    repairedToolName: 'countItems',
    expectedRepairCalls: 1,
    expectedEvents: [
      'callback:countItems:{"count":3}',
      'execute:countItems:{"count":3}',
    ],
  },
  {
    name: 'repairs an unknown tool name',
    originalToolName: 'missingTool',
    originalInput: '{"count":3}',
    repairedToolName: 'countItems',
    expectedRepairCalls: 1,
    expectedEvents: [
      'callback:countItems:{"count":3}',
      'execute:countItems:{"count":3}',
    ],
  },
  {
    name: 'repairs input without changing the tool name',
    originalToolName: 'countItems',
    originalInput: '{"count":"three"}',
    repairedToolName: 'countItems',
    repairedInput: '{"count":3}',
    expectedRepairCalls: 1,
    expectedEvents: [
      'callback:countItems:{"count":3}',
      'execute:countItems:{"count":3}',
    ],
  },
  {
    name: 'keeps an already valid call',
    originalToolName: 'countItems',
    originalInput: '{"count":3}',
    expectedRepairCalls: 0,
    expectedEvents: [
      'callback:countItems:{"count":3}',
      'execute:countItems:{"count":3}',
    ],
  },
];

function createCase(scenario: Scenario) {
  const events: string[] = [];
  let repairCalls = 0;

  const call = {
    type: 'tool-call' as const,
    toolCallId: 'call-1',
    toolName: scenario.originalToolName,
    input: scenario.originalInput,
  };

  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [call],
      finishReason,
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
        {
          type: 'tool-input-start' as const,
          id: call.toolCallId,
          toolName: call.toolName,
        },
        {
          type: 'tool-input-delta' as const,
          id: call.toolCallId,
          delta: call.input,
        },
        { type: 'tool-input-end' as const, id: call.toolCallId },
        call,
        { type: 'finish' as const, finishReason, usage },
      ]),
    }),
  });

  const tools = {
    lookupCity: tool({
      inputSchema: z.object({ city: z.string() }),
      onInputAvailable: ({ input }) => {
        events.push(`callback:lookupCity:${JSON.stringify(input)}`);
      },
    }),
    countItems: tool({
      inputSchema: z.object({ count: z.number() }),
      onInputAvailable: ({ input }) => {
        events.push(`callback:countItems:${JSON.stringify(input)}`);
      },
      execute: async input => {
        events.push(`execute:countItems:${JSON.stringify(input)}`);
        return 'done';
      },
    }),
  };

  const repairToolCall = async ({
    toolCall,
  }: {
    toolCall: LanguageModelV4ToolCall;
  }) => {
    repairCalls++;
    return {
      ...toolCall,
      toolName: scenario.repairedToolName ?? toolCall.toolName,
      input: scenario.repairedInput ?? toolCall.input,
    };
  };

  return {
    events,
    getRepairCalls: () => repairCalls,
    model,
    repairToolCall,
    tools,
  };
}

async function runCase(api: Api, scenario: Scenario) {
  const testCase = createCase(scenario);
  const options = {
    model: testCase.model,
    prompt: 'Count three items.',
    tools: testCase.tools,
    repairToolCall: testCase.repairToolCall,
    stopWhen: stepCountIs(1),
  };

  if (api === 'generateText') {
    await generateText(options);
  } else if (api === 'streamText') {
    const result = streamText(options);
    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        throw part.error;
      }
    }
  } else {
    const agent = new ToolLoopAgent({
      model: testCase.model,
      tools: testCase.tools,
      repairToolCall: testCase.repairToolCall,
      stopWhen: stepCountIs(1),
    });
    const result = await agent.stream({ prompt: options.prompt });
    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        throw part.error;
      }
    }
  }

  return {
    events: testCase.events,
    repairCalls: testCase.getRepairCalls(),
  };
}

function equal(actual: unknown, expected: unknown) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function main() {
  const routingFailures: string[] = [];

  for (const scenario of scenarios) {
    for (const api of [
      'generateText',
      'streamText',
      'ToolLoopAgent.stream',
    ] as const) {
      const result = await runCase(api, scenario);
      console.log(`${api} / ${scenario.name}: ${JSON.stringify(result)}`);

      if (result.repairCalls !== scenario.expectedRepairCalls) {
        throw new Error(
          `Control failure: ${api} / ${scenario.name} called repairToolCall ${result.repairCalls} times; expected ${scenario.expectedRepairCalls}.`,
        );
      }

      if (!equal(result.events, scenario.expectedEvents)) {
        routingFailures.push(
          `${api} / ${scenario.name}: ${JSON.stringify(result.events)}`,
        );
      }
    }
  }

  if (routingFailures.length > 0) {
    console.error(routingFailures.join('\n'));
    throw new Error(
      'ISSUE_21100_REPRODUCED: repaired tool input was routed to the wrong onInputAvailable callback',
    );
  }
}

await main();
