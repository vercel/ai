import assert from 'node:assert/strict';
import type { ImageModelV4, LanguageModelV4 } from '@ai-sdk/provider';
import {
  generateImage,
  streamText,
  type GenerateImageResult,
  type TextStreamPart,
} from 'ai';
import { parse, stringify } from 'superjson';

type FullStreamFilePart = Extract<TextStreamPart<never>, { type: 'file' }>;

const generatedBase64 = 'SGVsbG8=';
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

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

const imageGeneratingModel: ImageModelV4 = {
  specificationVersion: 'v4',
  provider: 'issue-8332-reproduction',
  modelId: 'image-model',
  maxImagesPerCall: 1,
  async doGenerate() {
    return {
      images: [pngBase64],
      warnings: [],
      response: {
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        modelId: 'image-model',
        headers: {},
      },
    };
  },
};

async function main() {
  const streamResult = streamText({
    model: fileGeneratingModel,
    prompt: 'Generate one file.',
  });

  let filePart: FullStreamFilePart | undefined;

  for await (const part of streamResult.fullStream) {
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

  const imageResult = await generateImage({
    model: imageGeneratingModel,
    prompt: 'Generate one image.',
  });

  assert.equal(
    imageResult.image.base64,
    pngBase64,
    'The in-process GenerateImageResult exposes image.base64.',
  );
  assert.equal(
    imageResult.images[0].base64,
    pngBase64,
    'The in-process GenerateImageResult exposes images[0].base64.',
  );

  // tRPC applies its configured data transformer to each yielded AsyncIterable
  // value. This is the documented SuperJSON output-transformer round trip.
  const transportedFilePart = parse<FullStreamFilePart>(stringify(filePart));
  const transportedImageResult = parse<GenerateImageResult>(
    stringify(imageResult),
  );

  console.log(
    JSON.stringify(
      {
        fullStream: {
          serializedFileKeys: Object.keys(transportedFilePart.file),
          typedBase64Value: transportedFilePart.file.base64,
          base64DataValue: (
            transportedFilePart.file as unknown as { base64Data?: string }
          ).base64Data,
        },
        generateImage: {
          serializedResultKeys: Object.keys(transportedImageResult),
          serializedImageKeys: Object.keys(transportedImageResult.images[0]),
          typedImageValue: transportedImageResult.image,
          typedImagesBase64Value: transportedImageResult.images[0].base64,
          imagesBase64DataValue: (
            transportedImageResult.images[0] as unknown as {
              base64Data?: string;
            }
          ).base64Data,
        },
      },
      null,
      2,
    ),
  );

  assert.deepEqual(
    {
      fullStreamFileBase64: transportedFilePart.file.base64,
      fullStreamFileUint8Array: transportedFilePart.file.uint8Array,
      generateImageImageBase64: transportedImageResult.image?.base64,
      generateImageImagesBase64: transportedImageResult.images[0].base64,
    },
    {
      fullStreamFileBase64: generatedBase64,
      fullStreamFileUint8Array: new TextEncoder().encode('Hello'),
      generateImageImageBase64: pngBase64,
      generateImageImagesBase64: pngBase64,
    },
    'ISSUE_8332_REPRODUCED: SuperJSON transport drops public GeneratedFile data and GenerateImageResult.image values.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
