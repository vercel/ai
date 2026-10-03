import assert from 'node:assert/strict';
import {
  generateText,
  NoOutputGeneratedError,
  Output,
  stepCountIs,
  tool,
  ToolLoopAgent,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

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

const lookup = tool({
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ result: `result for ${query}` }),
});

function createModel({ toolCallSteps }: { toolCallSteps: number }) {
  let callCount = 0;

  return new MockLanguageModelV4({
    doGenerate: async options => {
      callCount++;

      if (callCount <= toolCallSteps && (options.tools?.length ?? 0) > 0) {
        return {
          content: [
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: `call-${callCount}`,
              toolName: 'lookup',
              input: JSON.stringify({ query: `query-${callCount}` }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
          usage,
          warnings: [],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ summary: 'final structured output' }),
          },
        ],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      };
    },
  });
}

async function observeGenerateTextDefault() {
  const result = await generateText({
    model: createModel({ toolCallSteps: 1 }),
    tools: { lookup },
    output: Output.object({
      schema: z.object({ summary: z.string() }),
    }),
    prompt: 'Use the lookup tool and return a structured summary.',
  });

  try {
    result.output;
    return 'generated structured output';
  } catch (error) {
    assert.ok(
      NoOutputGeneratedError.isInstance(error),
      'generateText default failed for an unrelated reason',
    );
    return 'threw AI_NoOutputGeneratedError after its first tool-call step';
  }
}

async function verifyLastStepToolWorkaround() {
  const agent = new ToolLoopAgent({
    model: createModel({ toolCallSteps: 1 }),
    tools: { lookup },
    stopWhen: stepCountIs(2),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 1 ? { activeTools: [] } : undefined,
    output: Output.object({
      schema: z.object({ summary: z.string() }),
    }),
  });

  const result = await agent.generate({
    prompt: 'Use the lookup tool and return a structured summary.',
  });

  assert.deepEqual(result.output, {
    summary: 'final structured output',
  });
}

async function reproduceToolLoopAgentFailure() {
  const agent = new ToolLoopAgent({
    model: createModel({ toolCallSteps: 2 }),
    tools: { lookup },
    stopWhen: stepCountIs(2),
    output: Output.object({
      schema: z.object({ summary: z.string() }),
    }),
  });

  const result = await agent.generate({
    prompt: 'Use the lookup tool and return a structured summary.',
  });

  assert.equal(result.steps.length, 2);
  assert.equal(result.finalStep.finishReason, 'tool-calls');
  assert.equal(result.toolResults.length, 2);

  try {
    assert.deepEqual(result.output, {
      summary: 'final structured output',
    });
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      throw new Error(
        'ISSUE_13075_REPRODUCED: ToolLoopAgent stopped on the step limit after tool calls and result.output threw AI_NoOutputGeneratedError instead of generating the configured structured output.',
        { cause: error },
      );
    }

    throw error;
  }
}

async function main() {
  const defaultResult = await observeGenerateTextDefault();
  console.log(`generateText without stopWhen: ${defaultResult}`);

  await verifyLastStepToolWorkaround();
  console.log('Disabling tools on the last allowed step produced output.');

  await reproduceToolLoopAgentFailure();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
