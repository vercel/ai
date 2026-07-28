import { streamText } from 'ai';

const thoughtSignature = 'recorded-google-thought-signature';
const expectedProviderMetadata = {
  google: { thoughtSignature },
};

async function main() {
  const providerChunks = [
    { type: 'text-start' as const, id: 'text-1' },
    {
      type: 'text-delta' as const,
      id: 'text-1',
      delta: '4',
    },
    {
      type: 'text-delta' as const,
      id: 'text-1',
      delta: '',
      providerMetadata: expectedProviderMetadata,
    },
    { type: 'text-end' as const, id: 'text-1' },
    {
      type: 'finish' as const,
      finishReason: 'stop' as const,
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
    },
  ];

  const result = streamText({
    model: {
      specificationVersion: 'v2',
      provider: 'google.generative-ai',
      modelId: 'gemini-3-flash-preview',
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error('not implemented');
      },
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of providerChunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        }),
      }),
    },
    prompt: 'What is 2 + 2? Answer with only the number.',
  });

  const fullStream = [];
  for await (const chunk of result.fullStream) {
    fullStream.push(chunk);
  }

  const [step] = await result.steps;
  const textPart = step.content.find(part => part.type === 'text');

  console.log(
    JSON.stringify(
      {
        providerEmptyDelta: providerChunks[2],
        forwardedEmptyDelta:
          fullStream.find(
            chunk => chunk.type === 'text-delta' && chunk.text === '',
          ) ?? null,
        finalTextPart: textPart,
      },
      null,
      2,
    ),
  );

  if (
    JSON.stringify(textPart?.providerMetadata) !==
    JSON.stringify(expectedProviderMetadata)
  ) {
    throw new Error(
      'ISSUE_18073_REPRODUCED: streamText dropped provider metadata from the final text part',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
