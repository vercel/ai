import { WorkflowAgent } from '@ai-sdk/workflow';
import { ToolLoopAgent, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

type Observation = {
  modelTools: string[];
  executionCount: number;
};

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

function createRecordingScenario() {
  const modelTools: string[] = [];
  let executionCount = 0;
  let modelCallCount = 0;

  const model = new MockLanguageModelV4({
    doStream: async options => {
      const offeredTools = (options.tools ?? []).map(tool => tool.name);
      if (modelCallCount++ === 0) {
        modelTools.push(...offeredTools);
      }

      if (modelCallCount === 1 && offeredTools.includes('hidden')) {
        return {
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'call-hidden',
              toolName: 'hidden',
              input: '{}',
            },
            {
              type: 'finish',
              finishReason: {
                unified: 'tool-calls',
                raw: 'tool-calls',
              },
              usage,
            },
          ]),
        };
      }

      return {
        stream: convertArrayToReadableStream([
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  });

  const tools = {
    hidden: tool({
      inputSchema: z.object({}),
      execute: async () => {
        executionCount++;
        return 'should not run';
      },
    }),
  };

  return {
    model,
    tools,
    observation: (): Observation => ({ modelTools, executionCount }),
  };
}

async function runWorkflowConstructorScenario(): Promise<Observation> {
  const scenario = createRecordingScenario();
  const agent = new WorkflowAgent({
    model: scenario.model,
    tools: scenario.tools,
    activeTools: [],
  });

  await agent.stream({ prompt: 'hello' });
  return scenario.observation();
}

async function runWorkflowStreamScenario(): Promise<Observation> {
  const scenario = createRecordingScenario();
  const agent = new WorkflowAgent({
    model: scenario.model,
    tools: scenario.tools,
  });

  await agent.stream({ prompt: 'hello', activeTools: [] });
  return scenario.observation();
}

async function runWorkflowPrepareStepScenario(): Promise<Observation> {
  const scenario = createRecordingScenario();
  const agent = new WorkflowAgent({
    model: scenario.model,
    tools: scenario.tools,
    prepareStep: () => ({ activeTools: [] }),
  });

  await agent.stream({ prompt: 'hello' });
  return scenario.observation();
}

async function runToolLoopBaseline(): Promise<Observation> {
  const scenario = createRecordingScenario();
  const agent = new ToolLoopAgent({
    model: scenario.model,
    tools: scenario.tools,
    activeTools: [],
  });

  const result = await agent.stream({ prompt: 'hello' });
  await result.consumeStream();
  return scenario.observation();
}

async function main() {
  const observations = {
    toolLoop: await runToolLoopBaseline(),
    workflowConstructor: await runWorkflowConstructorScenario(),
    workflowStream: await runWorkflowStreamScenario(),
    workflowPrepareStep: await runWorkflowPrepareStepScenario(),
  };

  console.log(JSON.stringify(observations, null, 2));

  const workflowViolations = Object.entries(observations)
    .filter(([name]) => name.startsWith('workflow'))
    .filter(
      ([, observation]) =>
        observation.modelTools.length !== 0 || observation.executionCount !== 0,
    )
    .map(([name]) => name);

  if (workflowViolations.length > 0) {
    throw new Error(
      `ISSUE_20066_REPRODUCED: activeTools: [] exposed or executed the disabled "hidden" tool in ${workflowViolations.join(
        ', ',
      )}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
