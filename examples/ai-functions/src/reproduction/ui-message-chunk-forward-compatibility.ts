import assert from 'node:assert/strict';
import {
  parseJsonEventStream,
  TypeValidationError,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from 'ai';

function createEventStream(chunk: unknown): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.close();
    },
  });
}

async function readUiMessageChunks(chunk: unknown): Promise<UIMessageChunk[]> {
  const reader = parseJsonEventStream<UIMessageChunk>({
    stream: createEventStream(chunk),
    schema: uiMessageChunkSchema,
  }).getReader();
  const chunks: UIMessageChunk[] = [];

  while (true) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    if (!result.value.success) {
      throw result.value.error;
    }

    chunks.push(result.value.value);
  }

  return chunks;
}

function findUnrecognizedKeys(error: unknown): string[] | undefined {
  const stack = [error];
  const seen = new Set<unknown>();
  const matches: string[][] = [];

  while (stack.length > 0) {
    const value = stack.pop();

    if (value == null || typeof value !== 'object' || seen.has(value)) {
      continue;
    }

    seen.add(value);

    if (
      'code' in value &&
      value.code === 'unrecognized_keys' &&
      'keys' in value &&
      Array.isArray(value.keys)
    ) {
      matches.push(value.keys.map(String));
    }

    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }

    const record = value as Record<string, unknown>;

    for (const key of ['issues', 'errors', 'cause'] as const) {
      if (key in record) {
        stack.push(record[key]);
      }
    }

    stack.push(...Object.values(record));
  }

  return matches.sort((left, right) => left.length - right.length)[0];
}

async function main() {
  const baseChunk = {
    type: 'tool-output-available',
    toolCallId: 'call-123',
    output: { ok: true },
  } satisfies UIMessageChunk;

  const parsedBaseChunks = await readUiMessageChunks(baseChunk);
  assert.equal(parsedBaseChunks.length, 1);

  const newerServerChunk = {
    ...baseChunk,
    providerMetadata: {
      openai: {
        itemId: 'item-123',
      },
    },
    optionalFieldFromNewerServer: {
      addedIn: 'future-ai-sdk-patch',
    },
  };

  try {
    const parsedNewerServerChunks = await readUiMessageChunks(newerServerChunk);
    assert.equal(parsedNewerServerChunks.length, 1);
    assert.equal(parsedNewerServerChunks[0]?.type, baseChunk.type);
  } catch (error) {
    console.error(
      'Expected uiMessageChunkSchema to ignore unrecognized optional stream-event keys for forward compatibility, but parsing failed.',
    );

    if (TypeValidationError.isInstance(error)) {
      console.error(`Observed error: ${error.name}`);
      console.error(
        `Unrecognized keys: ${findUnrecognizedKeys(error.cause)?.join(', ')}`,
      );
    }

    throw new Error(
      'Reproduced: a newer-server UI message chunk with an extra optional key is rejected by the client schema.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
