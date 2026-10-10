import assert from 'node:assert/strict';
import type {
  LanguageModelV4,
  LanguageModelV4Content,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { generateText, streamText } from 'ai';

const metadata = { mock: { fileId: 'file-1' } };

type FileContent = Extract<
  LanguageModelV4Content,
  { type: 'file' | 'reasoning-file' }
>;

const createContent = (): FileContent[] => [
  {
    type: 'file',
    data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
    mediaType: 'image/png',
    providerMetadata: metadata,
  },
  {
    type: 'file',
    data: { type: 'data', data: new Uint8Array([4, 5, 6]) },
    mediaType: 'image/png',
  },
  {
    type: 'reasoning-file',
    data: { type: 'data', data: new Uint8Array([7, 8, 9]) },
    mediaType: 'image/png',
    providerMetadata: metadata,
  },
];

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 0,
    reasoning: 1,
  },
};

const finishReason = { unified: 'stop', raw: 'stop' } as const;

const model: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  supportedUrls: {},
  async doGenerate() {
    return {
      content: createContent(),
      finishReason,
      usage,
      warnings: [],
    };
  },
  async doStream() {
    const chunks: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      ...createContent(),
      { type: 'finish', finishReason, usage },
    ];

    return {
      stream: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
    };
  },
};

function findReasoningFile(
  content: Awaited<ReturnType<typeof generateText>>['content'],
) {
  const part = content.find(part => part.type === 'reasoning-file');
  assert.ok(part?.type === 'reasoning-file', 'Expected a reasoning-file part');
  return part;
}

function findFile(
  content: Awaited<ReturnType<typeof generateText>>['content'],
) {
  const part = content.find(part => part.type === 'file');
  assert.ok(part?.type === 'file', 'Expected a file part');
  return part;
}

async function main() {
  const generated = await generateText({ model, prompt: 'draw' });
  const streamed = streamText({ model, prompt: 'draw' });
  const [streamFiles, streamContent] = await Promise.all([
    streamed.files,
    streamed.content,
  ]);

  const generatedFile = findFile(generated.content);
  const streamedFile = findFile(streamContent);
  const generatedReasoningFile = findReasoningFile(generated.content);
  const streamedReasoningFile = findReasoningFile(streamContent);

  const observed = {
    generateContentMetadata: generatedFile.providerMetadata,
    generateFileMetadata: generated.files[0].providerMetadata,
    streamContentMetadata: streamedFile.providerMetadata,
    streamFileMetadata: streamFiles[0].providerMetadata,
    generateReasoningFileMetadata: generatedReasoningFile.file.providerMetadata,
    streamReasoningFileMetadata: streamedReasoningFile.file.providerMetadata,
    generateFileWithoutMetadata: generated.files[1].providerMetadata,
    streamFileWithoutMetadata: streamFiles[1].providerMetadata,
  };

  console.dir(observed, { depth: null });

  assert.deepStrictEqual(
    [
      observed.generateContentMetadata,
      observed.streamContentMetadata,
      generatedReasoningFile.providerMetadata,
      streamedReasoningFile.providerMetadata,
    ],
    [metadata, metadata, metadata, metadata],
    'Provider metadata should remain on surrounding content parts',
  );
  assert.deepStrictEqual(
    [observed.generateFileWithoutMetadata, observed.streamFileWithoutMetadata],
    [undefined, undefined],
    'Files emitted without provider metadata should remain metadata-free',
  );

  try {
    assert.deepStrictEqual(
      [observed.generateFileMetadata, observed.streamFileMetadata],
      [metadata, metadata],
    );
  } catch {
    throw new Error(
      'Issue #22596 reproduced: generateText().files and streamText().files omit GeneratedFile.providerMetadata',
    );
  }

  assert.deepStrictEqual(
    [
      observed.generateReasoningFileMetadata,
      observed.streamReasoningFileMetadata,
    ],
    [metadata, metadata],
    'Reasoning-file GeneratedFile objects should preserve provider metadata',
  );
}

main();
