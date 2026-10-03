import assert from 'node:assert/strict';
import {
  generateText,
  NoOutputGeneratedError,
  Output,
  stepCountIs,
  tool,
  ToolLoopAgent,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
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

function createToolLoopModel() {
  let callCount = 0;

  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      callCount += 1;

      if (callCount <= 2) {
        return {
          content: [
            {
              type: 'tool-call' as const,
              toolCallType: 'function' as const,
              toolCallId: `call-${callCount}`,
              toolName: 'search',
              input: JSON.stringify({ query: `query-${callCount}` }),
            },
          ],
          finishReason: {
            unified: 'tool-calls' as const,
            raw: 'tool-calls',
          },
          usage,
          warnings: [],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ answer: 'final structured output' }),
          },
        ],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage,
        warnings: [],
      };
    },
  });

  return {
    model,
    getCallCount: () => callCount,
  };
}

const tools = {
  search: tool({
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => ({ result: `result for ${query}` }),
  }),
};

const output = Output.object({
  schema: z.object({ answer: z.string() }),
});

async function observeDefaultGenerateTextBehavior() {
  const { model } = createToolLoopModel();
  const result = await generateText({
    model,
    tools,
    output,
    prompt: 'Use the search tool, then return structured output.',
  });

  try {
    result.output;
    return 'output-generated';
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      return 'AI_NoOutputGeneratedError';
    }
    throw error;
  }
}

async function main() {
  const defaultBehavior = await observeDefaultGenerateTextBehavior();
  console.log(`generateText without stopWhen: ${defaultBehavior}`);

  const { model, getCallCount } = createToolLoopModel();
  const agent = new ToolLoopAgent({
    model,
    tools,
    output,
    stopWhen: stepCountIs(2),
  });

  const result = await agent.generate({
    prompt: 'Use the search tool twice, then return structured output.',
  });

  try {
    const generatedOutput = result.output;
    assert.deepEqual(generatedOutput, {
      answer: 'final structured output',
    });
    console.log('ToolLoopAgent generated the requested structured output.');
  } catch (error) {
    if (!NoOutputGeneratedError.isInstance(error)) {
      throw error;
    }

    assert.equal(getCallCount(), 2);
    assert.equal(result.steps.length, 2);
    assert.equal(result.finishReason, 'tool-calls');
    assert.equal(result.toolResults.length, 1);

    console.error(
      'ISSUE_13075_REPRODUCED: ToolLoopAgent stopped at stepCountIs(2) after a tool-call result and result.output threw AI_NoOutputGeneratedError.',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
