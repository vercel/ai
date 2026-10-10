import assert from 'node:assert/strict';
import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  generateText,
  jsonSchema,
  simulateReadableStream,
  streamText,
  tool,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage: LanguageModelV4Usage = {
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

class ReproducedBugError extends Error {}

function createModel() {
  const toolCall = {
    type: 'tool-call' as const,
    toolCallId: 'call-1',
    toolName: 'lookup',
    input: '{}',
  };

  return new MockLanguageModelV4({
    doGenerate: {
      content: [toolCall],
      warnings: [],
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage,
    },
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          toolCall,
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
          },
        ],
      }),
    }),
  });
}

const inputSchema = jsonSchema<Record<string, never>>({
  type: 'object',
  additionalProperties: false,
});

function hasNullJsonToolResponse(
  messages: Array<{
    role: string;
    content: unknown;
  }>,
) {
  return messages.some(message => {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      return false;
    }

    return message.content.some(
      part =>
        typeof part === 'object' &&
        part !== null &&
        'output' in part &&
        typeof part.output === 'object' &&
        part.output !== null &&
        'type' in part.output &&
        part.output.type === 'json' &&
        'value' in part.output &&
        part.output.value === null,
    );
  });
}

async function runGenerateControls() {
  const one = await generateText({
    model: createModel(),
    prompt: 'Lookup',
    tools: {
      lookup: tool({
        inputSchema,
        execute: async function* () {
          yield { answer: 42 };
        },
      }),
    },
  });
  assert.deepEqual(one.staticToolResults[0]?.output, { answer: 42 });

  const multiple = await generateText({
    model: createModel(),
    prompt: 'Lookup',
    tools: {
      lookup: tool({
        inputSchema,
        execute: async function* () {
          yield { answer: 1 };
          yield { answer: 42 };
        },
      }),
    },
  });
  assert.deepEqual(multiple.staticToolResults[0]?.output, { answer: 42 });

  const explicitUndefined = await generateText({
    model: createModel(),
    prompt: 'Lookup',
    tools: {
      lookup: tool({
        inputSchema,
        execute: async function* (): AsyncGenerator<undefined> {
          yield undefined;
        },
      }),
    },
  });
  assert.equal(explicitUndefined.staticToolResults.length, 1);
  assert.equal(explicitUndefined.staticToolResults[0].output, undefined);
}

async function runStreamControls() {
  const one = streamText({
    model: createModel(),
    prompt: 'Lookup',
    tools: {
      lookup: tool({
        inputSchema,
        execute: async function* () {
          yield { answer: 42 };
        },
      }),
    },
  });
  assert.deepEqual((await one.staticToolResults)[0]?.output, { answer: 42 });

  const multiple = streamText({
    model: createModel(),
    prompt: 'Lookup',
    tools: {
      lookup: tool({
        inputSchema,
        execute: async function* () {
          yield { answer: 1 };
          yield { answer: 42 };
        },
      }),
    },
  });
  assert.deepEqual((await multiple.staticToolResults)[0]?.output, {
    answer: 42,
  });

  const explicitUndefined = streamText({
    model: createModel(),
    prompt: 'Lookup',
    tools: {
      lookup: tool({
        inputSchema,
        execute: async function* (): AsyncGenerator<undefined> {
          yield undefined;
        },
      }),
    },
  });
  const explicitUndefinedResults = await explicitUndefined.staticToolResults;
  assert.equal(explicitUndefinedResults.length, 1);
  assert.equal(explicitUndefinedResults[0].output, undefined);
}

async function main() {
  const emptyGenerateResult = await generateText({
    model: createModel(),
    prompt: 'Lookup',
    tools: {
      lookup: tool({
        inputSchema,
        execute: async function* () {
          if (false) {
            yield { answer: 42 };
          }
        },
      }),
    },
  });

  // Compile-time control: TypeScript accepts dereferencing the required output,
  // even though the current runtime value is undefined for the empty iterator.
  function readTypedGenerateOutput() {
    const answer: number =
      emptyGenerateResult.staticToolResults[0].output.answer;
    return answer;
  }
  void readTypedGenerateOutput;

  const emptyStreamResult = streamText({
    model: createModel(),
    prompt: 'Lookup',
    tools: {
      lookup: tool({
        inputSchema,
        execute: async function* () {
          if (false) {
            yield { answer: 42 };
          }
        },
      }),
    },
  });
  const emptyStreamToolResults = await emptyStreamResult.staticToolResults;

  await runGenerateControls();
  await runStreamControls();

  const symptoms: string[] = [];
  if (emptyGenerateResult.staticToolResults[0]?.output === undefined) {
    symptoms.push('generateText recorded a successful undefined output');
  }
  if (hasNullJsonToolResponse(emptyGenerateResult.response.messages)) {
    symptoms.push('generateText emitted a JSON null tool response');
  }
  if (emptyStreamToolResults[0]?.output === undefined) {
    symptoms.push('streamText recorded a successful undefined output');
  }
  if (hasNullJsonToolResponse((await emptyStreamResult.response).messages)) {
    symptoms.push('streamText emitted a JSON null tool response');
  }

  const hasSuccessfulUndefinedOutput = symptoms.some(symptom =>
    symptom.includes('successful undefined output'),
  );
  const hasNullToolResponse = symptoms.some(symptom =>
    symptom.includes('JSON null tool response'),
  );

  if (hasSuccessfulUndefinedOutput && hasNullToolResponse) {
    throw new ReproducedBugError(
      'ISSUE_22733: empty AsyncIterable produced a successful undefined output and JSON null tool response\n' +
        symptoms.map(symptom => `- ${symptom}`).join('\n'),
    );
  }

  assert.deepEqual(
    symptoms,
    [],
    'empty AsyncIterable must not synthesize a successful result or null response',
  );
  console.log('Issue #22733 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
