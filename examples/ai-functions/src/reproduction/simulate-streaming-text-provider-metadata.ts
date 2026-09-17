import { Agent } from '../../../../packages/ai/src/agent/agent.ts';
import { generateText } from '../../../../packages/ai/src/generate-text/generate-text.ts';
import { streamText } from '../../../../packages/ai/src/generate-text/stream-text.ts';
import { simulateStreamingMiddleware } from '../../../../packages/ai/src/middleware/simulate-streaming-middleware.ts';
import { wrapLanguageModel } from '../../../../packages/ai/src/middleware/wrap-language-model.ts';
import { MockLanguageModelV2 } from '../../../../packages/ai/src/test/mock-language-model-v2.ts';
import { convertToGoogleGenerativeAIMessages } from '../../../../packages/google/src/convert-to-google-generative-ai-messages.ts';

const usage = {
  inputTokens: 1,
  outputTokens: 2,
  totalTokens: 3,
  reasoningTokens: 0,
  cachedInputTokens: undefined,
};

const textParts = [
  {
    type: 'text' as const,
    text: 'Synthetic response one.',
    providerMetadata: {
      example: { reference: 'synthetic-reference-one' },
      google: { thoughtSignature: 'thought-signature-one' },
    },
  },
  {
    type: 'text' as const,
    text: 'Synthetic response two.',
    providerMetadata: {
      example: { reference: 'synthetic-reference-two' },
      google: { thoughtSignature: 'thought-signature-two' },
    },
  },
];

const expectedMetadata = textParts.map(part => part.providerMetadata);

function assertDeepEqual(actual: unknown, expected: unknown, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message ?? 'values are not deeply equal');
  }
}

function generationResult(
  content: Array<
    | (typeof textParts)[number]
    | {
        type: 'reasoning';
        text: string;
        providerMetadata: (typeof textParts)[number]['providerMetadata'];
      }
  >,
) {
  return {
    content,
    finishReason: 'stop' as const,
    usage,
    warnings: [],
  };
}

function getTextMetadata(
  content: Array<{
    type: string;
    providerMetadata?: unknown;
  }>,
) {
  return content
    .filter(part => part.type === 'text')
    .map(part => part.providerMetadata);
}

function getTextProviderOptions(
  messages: Array<{
    role: string;
    content: unknown;
  }>,
) {
  return messages
    .filter(message => message.role === 'assistant')
    .flatMap(message => (Array.isArray(message.content) ? message.content : []))
    .filter(part => part.type === 'text')
    .map(part => part.providerOptions);
}

function getGoogleThoughtSignatures(
  prompt: Parameters<typeof convertToGoogleGenerativeAIMessages>[0],
) {
  return convertToGoogleGenerativeAIMessages(prompt)
    .contents.filter(content => content.role === 'model')
    .flatMap(content => content.parts)
    .map(part =>
      'thoughtSignature' in part ? part.thoughtSignature : undefined,
    )
    .filter(signature => signature !== undefined);
}

async function main() {
  const generated = await generateText({
    model: new MockLanguageModelV2({
      doGenerate: generationResult(textParts),
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });

  assertDeepEqual(
    getTextMetadata(generated.content),
    expectedMetadata,
    'generateText control must preserve text provider metadata',
  );
  assertDeepEqual(
    getTextProviderOptions(generated.response.messages),
    expectedMetadata,
    'generateText control must preserve text provider options in response history',
  );

  const nativeModel = new MockLanguageModelV2({
    doStream: {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          for (const [index, part] of textParts.entries()) {
            const id = String(index);
            controller.enqueue({
              type: 'text-start',
              id,
              providerMetadata: part.providerMetadata,
            });
            controller.enqueue({
              type: 'text-delta',
              id,
              delta: part.text,
            });
            controller.enqueue({ type: 'text-end', id });
          }
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage,
          });
          controller.close();
        },
      }),
    },
  });
  const native = streamText({
    model: nativeModel,
    prompt: 'Test.',
    maxRetries: 0,
  });

  assertDeepEqual(
    getTextMetadata(await native.content),
    expectedMetadata,
    'native streaming control must preserve text provider metadata',
  );

  const simulatedModel = new MockLanguageModelV2({
    doGenerate: generationResult(textParts),
  });
  const simulated = streamText({
    model: wrapLanguageModel({
      model: simulatedModel,
      middleware: simulateStreamingMiddleware(),
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });
  const simulatedContent = await simulated.content;
  const simulatedResponse = await simulated.response;

  const continuationModel = new MockLanguageModelV2({
    doGenerate: generationResult([
      {
        type: 'text',
        text: 'Continuation.',
        providerMetadata: textParts[0].providerMetadata,
      },
    ]),
  });
  await generateText({
    model: continuationModel,
    messages: [
      { role: 'user', content: 'Test.' },
      ...simulatedResponse.messages,
      { role: 'user', content: 'Continue.' },
    ],
    maxRetries: 0,
  });
  const continuationPrompt = continuationModel.doGenerateCalls[0].prompt;

  const reasoningMetadata = {
    example: { reference: 'reasoning-reference' },
    google: { thoughtSignature: 'reasoning-signature' },
  };
  const simulatedReasoning = streamText({
    model: wrapLanguageModel({
      model: new MockLanguageModelV2({
        doGenerate: generationResult([
          {
            type: 'reasoning',
            text: 'Synthetic reasoning.',
            providerMetadata: reasoningMetadata,
          },
        ]),
      }),
      middleware: simulateStreamingMiddleware(),
    }),
    prompt: 'Test.',
    maxRetries: 0,
  });
  const reasoningContent = await simulatedReasoning.content;
  assertDeepEqual(
    reasoningContent[0]?.providerMetadata,
    reasoningMetadata,
    'simulated reasoning control must preserve provider metadata',
  );

  const agent = new Agent({
    model: wrapLanguageModel({
      model: new MockLanguageModelV2({
        doGenerate: generationResult([textParts[0]]),
      }),
      middleware: simulateStreamingMiddleware(),
    }),
    maxRetries: 0,
  });
  const agentResult = agent.stream({ prompt: 'Test.' });
  const agentContent = await agentResult.content;

  const primaryFailures: string[] = [];

  try {
    assertDeepEqual(getTextMetadata(simulatedContent), expectedMetadata);
  } catch {
    primaryFailures.push('result.content');
  }

  try {
    assertDeepEqual(
      getTextProviderOptions(simulatedResponse.messages),
      expectedMetadata,
    );
  } catch {
    primaryFailures.push('result.response.messages');
  }

  try {
    assertDeepEqual(
      getTextProviderOptions(continuationPrompt),
      expectedMetadata,
    );
  } catch {
    primaryFailures.push('continuation request');
  }

  try {
    assertDeepEqual(getGoogleThoughtSignatures(continuationPrompt), [
      'thought-signature-one',
      'thought-signature-two',
    ]);
  } catch {
    primaryFailures.push('Google continuation replay');
  }

  try {
    assertDeepEqual(getTextMetadata(agentContent), [expectedMetadata[0]]);
  } catch {
    primaryFailures.push('Experimental_Agent.stream');
  }

  if (primaryFailures.length > 0) {
    throw new Error(
      `ISSUE_20970_REPRODUCED: simulated streaming must retain text provider metadata; missing from ${primaryFailures.join(
        ', ',
      )}`,
    );
  }
}

await main();
