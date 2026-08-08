import assert from 'node:assert/strict';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { streamText, type TextStreamPart } from 'ai';

type FullStreamFilePart = Extract<TextStreamPart<never>, { type: 'file' }>;

const generatedBase64 = 'SGVsbG8=';

const fileGeneratingModel: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'issue-8332-reproduction',
  modelId: 'file-stream-model',
  supportedUrls: {},
  async doGenerate() {
    throw new Error(
      'This reproduction only exercises streamText().fullStream.',
    );
  },
  async doStream() {
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: generatedBase64 },
          });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 0,
                noCache: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 0, text: 0, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    };
  },
};

async function main() {
  const result = streamText({
    model: fileGeneratingModel,
    prompt: 'Generate one file.',
  });

  let filePart: FullStreamFilePart | undefined;

  for await (const part of result.fullStream) {
    if (part.type === 'file') {
      filePart = part;
    }
  }

  assert.ok(filePart, 'Expected fullStream to contain a file part.');
  assert.equal(
    filePart.file.base64,
    generatedBase64,
    'The in-process GeneratedFile exposes the typed base64 getter.',
  );

  // This round trip simulates returning fullStream parts through a JSON-compatible
  // transport such as tRPC's SuperJSON transformer. The TypeScript contract still
  // says `file.base64` is present, but the serialized runtime object only carries
  // the class backing field (`base64Data`).
  const transportedFilePart = JSON.parse(
    JSON.stringify(filePart),
  ) as FullStreamFilePart;

  console.log(
    JSON.stringify(
      {
        serializedFileKeys: Object.keys(transportedFilePart.file),
        typedBase64Value: transportedFilePart.file.base64,
        base64DataValue: (
          transportedFilePart.file as unknown as { base64Data?: string }
        ).base64Data,
      },
      null,
      2,
    ),
  );

  const typedBase64: string = transportedFilePart.file.base64;

  assert.equal(
    typedBase64,
    generatedBase64,
    'Expected serialized fullStream file part to match GeneratedFile.base64 at runtime.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
