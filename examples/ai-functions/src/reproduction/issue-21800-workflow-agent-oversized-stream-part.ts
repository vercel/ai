import assert from 'node:assert/strict';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import { tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const worldChunkLimit = 10 * 1024 * 1024;
const oversizedOutput = 'x'.repeat(worldChunkLimit + 1024);
const omittedOutput = {
  type: 'omitted',
  reason: 'too_large_for_trace',
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
    text: 0,
    reasoning: undefined,
  },
};

class ReproducedBugError extends Error {}

function createModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: 'code-interpreter-call',
          toolName: 'codeInterpreter',
          input: '{"code":"processLargeFile()"}',
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'code-interpreter-call',
          toolName: 'codeInterpreter',
          result: {
            type: 'code_interpreter_result',
            output: oversizedOutput,
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });
}

function createAgent() {
  return new WorkflowAgent({
    model: createModel(),
    tools: {
      codeInterpreter: tool({
        type: 'provider',
        id: 'openai.code_interpreter',
        isProviderExecuted: true,
        args: {},
        inputSchema: z.object({ code: z.string() }),
      }),
    },
  });
}

function serializedSize(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value));
}

async function verifyModelStepDataIsOtherwiseValid() {
  const result = await createAgent().stream({
    messages: [{ role: 'user', content: 'Process the large file.' }],
    writable: new WritableStream<ModelCallStreamPart>(),
  });
  const providerResult = result.steps[0]?.content.find(
    part => part.type === 'tool-result',
  );

  assert.equal(providerResult?.type, 'tool-result');
  assert.equal(
    (
      providerResult.output as {
        type: string;
        output: string;
      }
    ).output.length,
    oversizedOutput.length,
  );
}

async function main() {
  await verifyModelStepDataIsOtherwiseValid();

  let transformInvocationCount = 0;
  let transformSawOversizedResult = false;
  let largestAcceptedWrite = 0;

  const writable = new WritableStream<ModelCallStreamPart>({
    write(part) {
      const size = serializedSize(part);
      if (size > worldChunkLimit) {
        throw new Error(
          `size ${size} exceeds maximum allowed size of ${worldChunkLimit} bytes`,
        );
      }
      largestAcceptedWrite = Math.max(largestAcceptedWrite, size);
    },
  });

  try {
    await createAgent().stream({
      messages: [{ role: 'user', content: 'Process the large file.' }],
      writable,
      experimental_transform: () =>
        new TransformStream<
          LanguageModelV4StreamPart,
          LanguageModelV4StreamPart
        >({
          transform(part, controller) {
            transformInvocationCount++;

            if (
              part.type === 'tool-result' &&
              serializedSize(part) > worldChunkLimit
            ) {
              transformSawOversizedResult = true;
              controller.enqueue({ ...part, result: omittedOutput });
              return;
            }

            controller.enqueue(part);
          },
        }),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        `exceeds maximum allowed size of ${worldChunkLimit} bytes`,
      )
    ) {
      throw new ReproducedBugError(
        'ISSUE 21800 REPRODUCED: WorkflowAgent model step rejected oversized stream part; ' +
          `experimental_transform invocations=${transformInvocationCount}, ` +
          `sawOversizedResult=${transformSawOversizedResult}`,
      );
    }
    throw error;
  }

  assert.ok(
    largestAcceptedWrite <= worldChunkLimit,
    'WorkflowAgent completed but wrote an oversized stream part',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
