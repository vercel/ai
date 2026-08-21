import { EventStreamCodec } from '../../../../packages/amazon-bedrock/node_modules/@smithy/eventstream-codec';
import {
  fromUtf8,
  toUtf8,
} from '../../../../packages/amazon-bedrock/node_modules/@smithy/util-utf8';
import { BedrockChatLanguageModel } from '../../../../packages/amazon-bedrock/src/bedrock-chat-language-model';

const codec = new EventStreamCodec(toUtf8, fromUtf8);

function encodeEvent(eventType: string, value: unknown): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
    },
    body: fromUtf8(JSON.stringify(value)),
  });
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.length, 0),
  );
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function responseFromChunks(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/vnd.amazon.eventstream',
      },
    },
  );
}

function createModel(responseChunks: Uint8Array[]) {
  return new BedrockChatLanguageModel(
    'anthropic.claude-3-haiku-20240307-v1:0',
    {
      baseUrl: () => 'https://bedrock.example.test',
      headers: {},
      generateId: () => 'reproduction-id',
      fetch: async () => responseFromChunks(responseChunks),
    },
  );
}

async function consume(responseChunks: Uint8Array[]) {
  const { stream } = await createModel(responseChunks).doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ],
    includeRawChunks: false,
  });
  const parts = [];

  for await (const part of stream) {
    parts.push(part);
  }

  return parts;
}

async function main() {
  const messageStart = encodeEvent('messageStart', { role: 'assistant' });
  const contentBlockDelta = encodeEvent('contentBlockDelta', {
    contentBlockIndex: 0,
    delta: { text: 'partial response' },
  });
  const contentBlockStop = encodeEvent('contentBlockStop', {
    contentBlockIndex: 0,
  });
  const messageStop = encodeEvent('messageStop', { stopReason: 'end_turn' });
  const completeBody = concatenate([
    messageStart,
    contentBlockDelta,
    contentBlockStop,
    messageStop,
  ]);

  const splitAt = Math.floor(completeBody.length / 2);
  const fragmentedParts = await consume([
    completeBody.subarray(0, splitAt),
    completeBody.subarray(splitAt),
  ]);
  const fragmentedFinish = fragmentedParts.find(part => part.type === 'finish');

  if (
    !fragmentedParts.some(
      part => part.type === 'text-delta' && part.delta === 'partial response',
    ) ||
    fragmentedFinish?.finishReason !== 'stop'
  ) {
    throw new Error(
      'SETUP FAILED: complete fragmented AWS event-stream frames did not decode successfully',
    );
  }

  const cleanBoundaryParts = await consume([
    concatenate([messageStart, contentBlockDelta, contentBlockStop]),
  ]);
  const cleanBoundaryFinish = cleanBoundaryParts.find(
    part => part.type === 'finish',
  );

  if (cleanBoundaryFinish == null) {
    throw new Error(
      'SETUP FAILED: clean frame-boundary EOF did not reach a terminal stream state',
    );
  }

  const truncatedBody = completeBody.subarray(0, -1);

  try {
    const truncatedParts = await consume([truncatedBody]);
    const finish = truncatedParts.find(part => part.type === 'finish');
    throw new Error(
      `BUG REPRODUCED: truncated AWS event-stream frame closed normally with finishReason=${JSON.stringify(
        finish?.finishReason,
      )} and usage=${JSON.stringify(finish?.usage)}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('BUG REPRODUCED:')) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (!/(incomplete|truncat|event.?stream|buffer)/i.test(message)) {
      throw new Error(
        `UNEXPECTED FAILURE: truncated stream rejected without a descriptive incomplete-frame error: ${message}`,
      );
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
