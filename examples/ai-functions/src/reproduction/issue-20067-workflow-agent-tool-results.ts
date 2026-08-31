import { WorkflowAgent } from '@ai-sdk/workflow';
import { dynamicTool, tool, ToolLoopAgent } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

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

function createTwoStepModel(toolName: string) {
  let callCount = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      callCount++;

      if (callCount === 1) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            {
              type: 'tool-call' as const,
              toolCallId: `${toolName}-call`,
              toolName,
              input: '{}',
            },
            {
              type: 'finish' as const,
              finishReason: {
                unified: 'tool-calls' as const,
                raw: 'tool-calls',
              },
              usage,
            },
          ]),
        };
      }

      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: 'text' },
          { type: 'text-delta' as const, id: 'text', delta: 'done' },
          { type: 'text-end' as const, id: 'text' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  });

  return {
    model,
    getCallCount: () => callCount,
  };
}

function hasSuccessfulToolOutput({
  steps,
}: {
  steps: Array<{ toolResults: Array<{ output: unknown }> }>;
}) {
  return (
    steps
      .at(-1)
      ?.toolResults.some(
        result =>
          typeof result.output === 'object' &&
          result.output !== null &&
          'ok' in result.output &&
          result.output.ok === true,
      ) ?? false
  );
}

function assert(
  condition: unknown,
  message: string,
  observations: unknown,
): asserts condition {
  if (!condition) {
    throw new Error(`${message}\n${JSON.stringify(observations)}`);
  }
}

function containsSuccessfulResult(value: unknown, toolName: string) {
  return (
    Array.isArray(value) &&
    value.some(
      result =>
        typeof result === 'object' &&
        result !== null &&
        'toolName' in result &&
        result.toolName === toolName &&
        'output' in result &&
        typeof result.output === 'object' &&
        result.output !== null &&
        'ok' in result.output &&
        result.output.ok === true,
    )
  );
}

async function verifyToolLoopAgentBaseline() {
  const { model, getCallCount } = createTwoStepModel('works');
  const agent = new ToolLoopAgent({
    model,
    tools: {
      works: tool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    },
    stopWhen: hasSuccessfulToolOutput,
  });

  const result = await agent.stream({ prompt: 'call works' });
  const steps = await result.steps;

  assert(
    getCallCount() === 1 && steps.length === 1,
    'ToolLoopAgent control did not stop after inspecting the tool output',
    {
      modelCalls: getCallCount(),
      stepToolResults: steps.map(step => step.toolResults),
    },
  );
}

async function verifyWorkflowAgentStopCondition() {
  const { model, getCallCount } = createTwoStepModel('works');
  const stopWhenObservations: unknown[] = [];
  const agent = new WorkflowAgent({
    model,
    tools: {
      works: tool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    },
    stopWhen: event => {
      stopWhenObservations.push(event.steps.at(-1)?.toolResults);
      return hasSuccessfulToolOutput(event);
    },
  });

  const result = await agent.stream({ prompt: 'call works' });
  const observations = {
    modelCalls: getCallCount(),
    stopWhenToolResults: stopWhenObservations,
    resultStepToolResults: result.steps.map(step => step.toolResults),
  };

  assert(
    getCallCount() === 1 && result.steps.length === 1,
    'WorkflowAgent stopWhen could not inspect the executed tool output and allowed an extra model step',
    observations,
  );
}

async function verifyWorkflowAgentStepConsumers() {
  const { model } = createTwoStepModel('works');
  const onStepEnd: unknown[] = [];
  const prepareStep: unknown[] = [];
  const agent = new WorkflowAgent({
    model,
    tools: {
      works: tool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    },
    prepareStep: event => {
      if (event.stepNumber > 0) {
        prepareStep.push({
          toolResults: event.steps[0]?.toolResults,
          staticToolResults: event.steps[0]?.staticToolResults,
        });
      }
      return {};
    },
    onStepEnd: step => {
      onStepEnd.push({
        toolResults: step.toolResults,
        staticToolResults: step.staticToolResults,
      });
    },
  });

  const result = await agent.stream({ prompt: 'call works' });
  const observations = {
    prepareStep,
    onStepEnd,
    resultSteps: result.steps.map(step => ({
      toolResults: step.toolResults,
      staticToolResults: step.staticToolResults,
    })),
  };

  const preparedFirstStep = prepareStep[0] as
    | { toolResults: unknown; staticToolResults: unknown }
    | undefined;
  const onStepEndFirstStep = onStepEnd[0] as
    | { toolResults: unknown; staticToolResults: unknown }
    | undefined;
  const resultFirstStep = observations.resultSteps[0];

  assert(
    containsSuccessfulResult(preparedFirstStep?.toolResults, 'works') &&
      containsSuccessfulResult(preparedFirstStep?.staticToolResults, 'works'),
    'the next prepareStep call did not receive the completed static tool result',
    observations,
  );
  assert(
    containsSuccessfulResult(onStepEndFirstStep?.toolResults, 'works') &&
      containsSuccessfulResult(onStepEndFirstStep?.staticToolResults, 'works'),
    'onStepEnd did not receive the completed static tool result',
    observations,
  );
  assert(
    containsSuccessfulResult(resultFirstStep?.toolResults, 'works') &&
      containsSuccessfulResult(resultFirstStep?.staticToolResults, 'works'),
    'result.steps did not retain the completed static tool result',
    observations,
  );
}

async function verifyWorkflowAgentDynamicToolResults() {
  const { model } = createTwoStepModel('dynamicWorks');
  const onStepEnd: unknown[] = [];
  const agent = new WorkflowAgent({
    model,
    tools: {
      dynamicWorks: dynamicTool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    },
    onStepEnd: step => {
      onStepEnd.push({
        toolResults: step.toolResults,
        staticToolResults: step.staticToolResults,
        dynamicToolResults: step.dynamicToolResults,
      });
    },
  });

  const result = await agent.stream({ prompt: 'call dynamicWorks' });
  const observations = {
    onStepEnd,
    resultSteps: result.steps.map(step => ({
      toolResults: step.toolResults,
      staticToolResults: step.staticToolResults,
      dynamicToolResults: step.dynamicToolResults,
    })),
  };
  const firstStep = observations.resultSteps[0];
  const onStepEndFirstStep = onStepEnd[0] as
    | {
        toolResults: unknown;
        staticToolResults: unknown[];
        dynamicToolResults: unknown;
      }
    | undefined;

  assert(
    containsSuccessfulResult(firstStep?.toolResults, 'dynamicWorks') &&
      firstStep.staticToolResults.length === 0 &&
      containsSuccessfulResult(firstStep.dynamicToolResults, 'dynamicWorks'),
    'WorkflowAgent omitted the executed dynamic tool result from the completed step',
    observations,
  );
  assert(
    containsSuccessfulResult(onStepEndFirstStep?.toolResults, 'dynamicWorks') &&
      onStepEndFirstStep?.staticToolResults.length === 0 &&
      containsSuccessfulResult(
        onStepEndFirstStep?.dynamicToolResults,
        'dynamicWorks',
      ),
    'onStepEnd did not receive the completed dynamic tool result',
    observations,
  );
}

async function main() {
  await verifyToolLoopAgentBaseline();

  const failures: string[] = [];
  for (const verify of [
    verifyWorkflowAgentStopCondition,
    verifyWorkflowAgentStepConsumers,
    verifyWorkflowAgentDynamicToolResults,
  ]) {
    try {
      await verify();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_20067_REPRODUCED: completed WorkflowAgent steps omit executed tool results\n${failures.join('\n')}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
