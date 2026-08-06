import { generateText, stepCountIs, streamText, tool, ToolLoopAgent } from 'ai';
import {
  convertArrayToReadableStream,
  MockLanguageModelV3,
  MockLanguageModelV4,
} from 'ai/test';
import { z } from 'zod';

const RESULT_BYTES = 2_000;
const STEP_COUNTS = [20, 40] as const;

function buildGenerateModel(): MockLanguageModelV3 {
  let step = 0;

  return new MockLanguageModelV3({
    doGenerate: async ({ prompt }) => {
      step++;

      return {
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        content: [
          {
            type: 'tool-call' as const,
            toolCallId: `call-${step}`,
            toolName: 'work',
            input: JSON.stringify({ n: step }),
          },
        ],
        warnings: [],
        request: { body: JSON.stringify(prompt) },
        response: {
          id: `response-${step}`,
          timestamp: new Date(0),
          modelId: 'mock',
        },
      };
    },
  });
}

const tools = {
  work: tool({
    description: 'Return a fixed-size tool result.',
    inputSchema: z.object({ n: z.number() }),
    execute: async ({ n }) => `${n}:${'x'.repeat(RESULT_BYTES)}`,
  }),
};

function retainedRequestBodyBytes(
  steps: Array<{ request: { body?: unknown } }>,
): number {
  return steps.reduce(
    (total, step) =>
      total +
      (step.request.body === undefined
        ? 0
        : JSON.stringify(step.request.body).length),
    0,
  );
}

async function runGenerateText(
  maxSteps: number,
  requestBody?: boolean,
): Promise<number> {
  const result = await generateText({
    model: buildGenerateModel(),
    messages: [{ role: 'user', content: 'go' }],
    tools,
    stopWhen: stepCountIs(maxSteps),
    ...(requestBody === undefined ? {} : { include: { requestBody } }),
  });

  if (result.steps.length !== maxSteps) {
    throw new Error(
      `Expected ${maxSteps} generateText steps, received ${result.steps.length}.`,
    );
  }

  return retainedRequestBodyBytes(result.steps);
}

async function runAgent(
  maxSteps: number,
  requestBody?: boolean,
): Promise<number> {
  const agent = new ToolLoopAgent({
    model: buildGenerateModel(),
    instructions: 'loop',
    tools,
    stopWhen: stepCountIs(maxSteps),
    ...(requestBody === undefined ? {} : { include: { requestBody } }),
  });

  const result = await agent.generate({
    messages: [{ role: 'user', content: 'go' }],
  });

  if (result.steps.length !== maxSteps) {
    throw new Error(
      `Expected ${maxSteps} agent steps, received ${result.steps.length}.`,
    );
  }

  return retainedRequestBodyBytes(result.steps);
}

async function runStreamText(): Promise<number> {
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        request: { body: '{"prompt":"go"}' },
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'done' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ]),
      }),
    }),
    prompt: 'go',
  });

  return retainedRequestBodyBytes(await result.steps);
}

function assertBodiesExcluded(label: string, retainedBytes: number): void {
  if (retainedBytes !== 0) {
    throw new Error(
      `ISSUE #18526 REPRODUCED: ${label} retained request bodies by default (${retainedBytes} serialized bytes).`,
    );
  }
}

async function main(): Promise<void> {
  const defaultGenerate = await Promise.all(
    STEP_COUNTS.map(stepCount => runGenerateText(stepCount)),
  );
  const defaultAgent = await Promise.all(
    STEP_COUNTS.map(stepCount => runAgent(stepCount)),
  );
  const explicitOptIn = await Promise.all(
    STEP_COUNTS.map(stepCount => runGenerateText(stepCount, true)),
  );
  const defaultStream = await runStreamText();

  for (const [index, stepCount] of STEP_COUNTS.entries()) {
    assertBodiesExcluded(
      `generateText at ${stepCount} steps`,
      defaultGenerate[index],
    );
    assertBodiesExcluded(
      `ToolLoopAgent.generate at ${stepCount} steps`,
      defaultAgent[index],
    );
  }
  assertBodiesExcluded('streamText', defaultStream);

  const optInGrowth = explicitOptIn[1] / explicitOptIn[0];
  if (optInGrowth < 3.5 || optInGrowth > 4.5) {
    throw new Error(
      `Expected explicit request-body retention to demonstrate approximately quadratic growth; observed ${optInGrowth.toFixed(2)}x.`,
    );
  }

  console.log('Issue #18526 could not be reproduced on the target branch.');
  console.log(
    `Default retained bytes: generateText=${defaultGenerate.join('/')}, ToolLoopAgent.generate=${defaultAgent.join('/')}, streamText=${defaultStream}.`,
  );
  console.log(
    `Explicit include.requestBody=true retained bytes: ${explicitOptIn.join('/')} (${optInGrowth.toFixed(2)}x when steps doubled).`,
  );
}

await main();
