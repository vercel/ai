import {
  generateText,
  pruneMessages,
  streamText,
  tool,
  ToolLoopAgent,
  type ModelMessage,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

type EntryPoint =
  | 'generateText'
  | 'streamText'
  | 'ToolLoopAgent.generate'
  | 'ToolLoopAgent.stream';

type PruningStrategy =
  | 'none'
  | 'before-last-message'
  | 'before-last-2-messages'
  | 'selective-before-last-message';

type Scenario = {
  approval: 'approved' | 'denied' | 'completed';
  entryPoint: EntryPoint;
  strategy: PruningStrategy;
};

type ScenarioResult = Scenario & {
  errorName?: string;
  executions: number;
  modelCalls: number;
  text?: string;
};

const entryPoints: EntryPoint[] = [
  'generateText',
  'streamText',
  'ToolLoopAgent.generate',
  'ToolLoopAgent.stream',
];

const pendingStrategies: PruningStrategy[] = [
  'none',
  'before-last-message',
  'before-last-2-messages',
  'selective-before-last-message',
];

function createMessages({
  approval,
}: Pick<Scenario, 'approval'>): ModelMessage[] {
  const approved = approval !== 'denied';

  return [
    { role: 'user', content: 'Echo hello.' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'echo',
          input: { value: 'hello' },
        },
        {
          type: 'tool-approval-request',
          toolCallId: 'call-1',
          approvalId: 'approval-1',
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved,
        },
        ...(approval === 'completed'
          ? [
              {
                type: 'tool-result' as const,
                toolCallId: 'call-1',
                toolName: 'echo',
                output: { type: 'text' as const, value: 'hello' },
              },
            ]
          : []),
      ],
    },
  ];
}

function prune(
  messages: ModelMessage[],
  strategy: PruningStrategy,
): ModelMessage[] {
  switch (strategy) {
    case 'none':
      return pruneMessages({ messages, toolCalls: 'none' });
    case 'before-last-message':
      return pruneMessages({ messages, toolCalls: 'before-last-message' });
    case 'before-last-2-messages':
      return pruneMessages({ messages, toolCalls: 'before-last-2-messages' });
    case 'selective-before-last-message':
      return pruneMessages({
        messages,
        toolCalls: [{ type: 'before-last-message', tools: ['echo'] }],
      });
  }
}

function createModel() {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };

  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'Done.' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    },
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Done.' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    },
  });
}

async function readStream(result: {
  fullStream: AsyncIterable<{ type: string; error?: unknown }>;
  text: PromiseLike<string>;
}): Promise<string> {
  let streamError: unknown;

  const [textResult] = await Promise.all([
    Promise.resolve(result.text).then(
      value => ({ value }),
      error => ({ error }),
    ),
    (async () => {
      for await (const part of result.fullStream) {
        if (part.type === 'error') {
          streamError = part.error;
        }
      }
    })(),
  ]);

  if (streamError != null) {
    throw streamError;
  }
  if ('error' in textResult) {
    throw textResult.error;
  }

  return textResult.value;
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  let executions = 0;
  const model = createModel();
  const tools = {
    echo: tool({
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => {
        executions++;
        return value;
      },
    }),
  };
  const messages = prune(createMessages(scenario), scenario.strategy);

  try {
    let text: string;

    switch (scenario.entryPoint) {
      case 'generateText':
        text = (await generateText({ model, tools, messages })).text;
        break;
      case 'streamText': {
        const result = streamText({
          model,
          tools,
          messages,
          onError: () => {},
        });
        text = await readStream(result);
        break;
      }
      case 'ToolLoopAgent.generate': {
        const agent = new ToolLoopAgent({ model, tools });
        text = (await agent.generate({ messages })).text;
        break;
      }
      case 'ToolLoopAgent.stream': {
        const agent = new ToolLoopAgent({ model, tools });
        text = await readStream(await agent.stream({ messages }));
        break;
      }
    }

    return {
      ...scenario,
      executions,
      modelCalls: model.doGenerateCalls.length + model.doStreamCalls.length,
      text,
    };
  } catch (error) {
    return {
      ...scenario,
      errorName: error instanceof Error ? error.name : String(error),
      executions,
      modelCalls: model.doGenerateCalls.length + model.doStreamCalls.length,
    };
  }
}

function describeScenario(scenario: Scenario): string {
  return `${scenario.entryPoint}/${scenario.approval}/${scenario.strategy}`;
}

function hasOriginatingToolCall(messages: ModelMessage[]): boolean {
  return messages.some(
    message =>
      message.role === 'assistant' &&
      typeof message.content !== 'string' &&
      message.content.some(
        part => part.type === 'tool-call' && part.toolCallId === 'call-1',
      ),
  );
}

async function main() {
  const scenarios: Scenario[] = [
    ...entryPoints.flatMap(entryPoint =>
      (['approved', 'denied'] as const).flatMap(approval =>
        pendingStrategies.map(strategy => ({
          approval,
          entryPoint,
          strategy,
        })),
      ),
    ),
    ...entryPoints.map(entryPoint => ({
      approval: 'completed' as const,
      entryPoint,
      strategy: 'before-last-message' as const,
    })),
  ];

  const results = await Promise.all(scenarios.map(runScenario));
  const primaryFailures: ScenarioResult[] = [];
  const unexpectedFailures: string[] = [];

  for (const result of results) {
    const expectedExecutions = result.approval === 'approved' ? 1 : 0;
    const outcomeWorked =
      result.errorName == null &&
      result.text === 'Done.' &&
      result.executions === expectedExecutions &&
      result.modelCalls === 1;

    if (outcomeWorked) {
      continue;
    }

    const isReportedPrimaryFailure =
      result.approval !== 'completed' &&
      (result.strategy === 'before-last-message' ||
        result.strategy === 'selective-before-last-message') &&
      result.errorName === 'AI_ToolCallNotFoundForApprovalError' &&
      result.executions === 0 &&
      result.modelCalls === 0;

    if (isReportedPrimaryFailure) {
      primaryFailures.push(result);
    } else {
      unexpectedFailures.push(
        `${describeScenario(result)} => ${JSON.stringify(result)}`,
      );
    }
  }

  const retentionFailures = (['approved', 'denied'] as const).flatMap(
    approval =>
      (
        ['before-last-message', 'selective-before-last-message'] as const
      ).flatMap(strategy => {
        const messages = prune(createMessages({ approval }), strategy);
        return hasOriginatingToolCall(messages)
          ? []
          : [`${approval}/${strategy}`];
      }),
  );

  if (unexpectedFailures.length > 0) {
    console.error('ISSUE_20953_HARNESS_FAILURE');
    console.error(unexpectedFailures.join('\n'));
    process.exitCode = 2;
    return;
  }

  if (primaryFailures.length > 0) {
    console.error(
      'ISSUE_20953_REPRODUCED: pending approval resumptions failed with AI_ToolCallNotFoundForApprovalError before tool or model execution.',
    );
    console.error(
      `Affected scenarios: ${primaryFailures.length}; missing originating tool-call histories: ${retentionFailures.length}.`,
    );
    for (const failure of primaryFailures) {
      console.error(`- ${describeScenario(failure)}`);
    }
    process.exitCode = 1;
    return;
  }

  if (retentionFailures.length > 0) {
    console.error(
      'ISSUE_20953_RETENTION_FAILURE: pending approval histories still omit the originating tool call.',
    );
    console.error(retentionFailures.join('\n'));
    process.exitCode = 2;
    return;
  }

  console.log(
    `Issue #20953 is fixed: all ${results.length} approval scenarios passed.`,
  );
}

await main();
