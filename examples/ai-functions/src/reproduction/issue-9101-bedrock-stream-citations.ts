import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { TypeValidationError } from '@ai-sdk/provider';
import { streamText } from 'ai';
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createBedrockEventStreamDecoder } from '../../../../packages/amazon-bedrock/src/bedrock-event-stream-decoder';

type BedrockChunk = Record<string, unknown>;

async function collectBedrockChunks(
  body: ReadableStream<Uint8Array>,
): Promise<BedrockChunk[]> {
  const chunks: BedrockChunk[] = [];
  const decodedStream = createBedrockEventStreamDecoder<BedrockChunk>(
    body,
    (event, controller) => {
      const payloadType =
        event.messageType === 'event'
          ? event.eventType
          : event.messageType === 'exception'
            ? event.exceptionType
            : undefined;

      if (payloadType == null) {
        return;
      }

      const data = JSON.parse(event.data) as Record<string, unknown>;
      delete data.p;
      controller.enqueue({ [payloadType]: data });
    },
  );

  const reader = decodedStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return chunks;
    }
    chunks.push(value);
  }
}

function hasCitationDelta(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value != null &&
    JSON.stringify(value).includes('"contentBlockDelta"') &&
    JSON.stringify(value).includes('"citation"')
  );
}

async function main() {
  let providerChunksPromise: Promise<BedrockChunk[]> | undefined;
  const bedrock = createAmazonBedrock({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const clonedBody = response.clone().body;
      if (response.ok && clonedBody != null) {
        providerChunksPromise = collectBedrockChunks(clonedBody);
      }
      return response;
    },
  });

  const result = streamText({
    model: bedrock('us.anthropic.claude-sonnet-4-20250514-v1:0'),
    includeRawChunks: true,
    onError: () => {},
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is generative AI? Cite the supplied document.',
          },
          {
            type: 'file',
            data: await readFile(
              resolve(process.cwd(), '../ai-core/data/ai.pdf'),
            ),
            mediaType: 'application/pdf',
            providerOptions: {
              bedrock: {
                citations: { enabled: true },
              },
            },
          },
        ],
      },
    ],
  });

  let sdkCitationDeltaCount = 0;
  let citationValidationErrorCount = 0;
  const unexpectedErrors: unknown[] = [];

  for await (const part of result.fullStream) {
    if (part.type === 'raw' && hasCitationDelta(part.rawValue)) {
      sdkCitationDeltaCount++;
    }

    if (
      part.type === 'error' &&
      TypeValidationError.isInstance(part.error) &&
      hasCitationDelta(part.error.value)
    ) {
      citationValidationErrorCount++;
    } else if (part.type === 'error') {
      unexpectedErrors.push(part.error);
    }
  }

  const providerChunks = await providerChunksPromise;
  if (providerChunks == null) {
    if (unexpectedErrors.length > 0) {
      throw unexpectedErrors[0];
    }
    throw new Error(
      'ISSUE_9101_INCONCLUSIVE: no successful Bedrock stream was captured',
    );
  }

  const providerCitationDeltaCount =
    providerChunks.filter(hasCitationDelta).length;
  if (providerCitationDeltaCount === 0) {
    throw new Error(
      'ISSUE_9101_INCONCLUSIVE: Bedrock returned no citation deltas',
    );
  }

  await writeFile(
    resolve(
      process.cwd(),
      '../../packages/amazon-bedrock/src/__fixtures__/bedrock-document-citations.chunks.txt',
    ),
    `${providerChunks.map(chunk => JSON.stringify(chunk)).join('\n')}\n`,
  );

  if (citationValidationErrorCount > 0) {
    console.error(
      `ISSUE_9101_REPRODUCED: valid Bedrock citation delta failed AI SDK validation (${citationValidationErrorCount}/${providerCitationDeltaCount})`,
    );
    process.exitCode = 1;
    return;
  }

  if (sdkCitationDeltaCount !== providerCitationDeltaCount) {
    throw new Error(
      `ISSUE_9101_INCONCLUSIVE: Bedrock returned ${providerCitationDeltaCount} citation deltas but AI SDK exposed ${sdkCitationDeltaCount}`,
    );
  }

  console.log(
    `ISSUE_9101_FIXED: accepted ${sdkCitationDeltaCount} Bedrock citation deltas without validation errors`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
