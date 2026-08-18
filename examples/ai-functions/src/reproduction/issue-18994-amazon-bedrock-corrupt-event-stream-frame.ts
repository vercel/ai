import { z } from 'zod/v4';
import { AmazonBedrockChatLanguageModel } from '../../../../packages/amazon-bedrock/src/amazon-bedrock-chat-language-model';
import { createAmazonBedrockEventStreamDecoder } from '../../../../packages/amazon-bedrock/src/amazon-bedrock-event-stream-decoder';
import { createAmazonBedrockEventStreamResponseHandler } from '../../../../packages/amazon-bedrock/src/amazon-bedrock-event-stream-response-handler';

const PRIMARY_FAILURE_SIGNAL =
  'REPRODUCTION FAILED: corrupted AWS event-stream frame produced a silent normal completion instead of surfacing an error';
const PROCESS_EVENT_FAILURE_SIGNAL =
  'REPRODUCTION FAILED: processEvent rejection completed silently without surfacing an error';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(...arrays: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    arrays.reduce((length, array) => length + array.length, 0),
  );
  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

function encodeStringHeader(name: string, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const valueBytes = encoder.encode(value);
  const header = new Uint8Array(
    1 + nameBytes.length + 1 + 2 + valueBytes.length,
  );
  const view = new DataView(header.buffer);

  header[0] = nameBytes.length;
  header.set(nameBytes, 1);
  header[1 + nameBytes.length] = 7; // AWS event-stream string header
  view.setUint16(1 + nameBytes.length + 1, valueBytes.length, false);
  header.set(valueBytes, 1 + nameBytes.length + 1 + 2);

  return header;
}

function createEventStreamFrame({
  messageType,
  eventType,
  data,
}: {
  messageType: string;
  eventType: string;
  data: string;
}): Uint8Array {
  const headers = concatenate(
    encodeStringHeader(':message-type', messageType),
    encodeStringHeader(
      messageType === 'exception' ? ':exception-type' : ':event-type',
      eventType,
    ),
    encodeStringHeader(':content-type', 'application/json'),
  );
  const payload = new TextEncoder().encode(data);
  const totalLength = 16 + headers.length + payload.length;
  const frame = new Uint8Array(totalLength);
  const view = new DataView(frame.buffer);

  view.setUint32(0, totalLength, false);
  view.setUint32(4, headers.length, false);
  view.setUint32(8, crc32(frame.subarray(0, 8)), false);
  frame.set(headers, 12);
  frame.set(payload, 12 + headers.length);
  view.setUint32(
    totalLength - 4,
    crc32(frame.subarray(0, totalLength - 4)),
    false,
  );

  return frame;
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function consume<T>(stream: ReadableStream<T>): Promise<{
  values: T[];
  error: unknown;
}> {
  const values: T[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return { values, error: undefined };
      }
      values.push(value);
    }
  } catch (error) {
    return { values, error };
  } finally {
    reader.releaseLock();
  }
}

async function reproduceCorruptFrameFailure() {
  const corruptedFrame = createEventStreamFrame({
    messageType: 'event',
    eventType: 'contentBlockDelta',
    data: JSON.stringify({
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'corrupted' },
      },
    }),
  });
  corruptedFrame[corruptedFrame.length - 1] ^= 0xff;

  const laterValidFrame = createEventStreamFrame({
    messageType: 'event',
    eventType: 'contentBlockDelta',
    data: JSON.stringify({
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'valid but stranded' },
      },
    }),
  });

  let processedEvents = 0;
  const output = createAmazonBedrockEventStreamDecoder(
    streamFromChunks([corruptedFrame, laterValidFrame]),
    (event, controller) => {
      processedEvents++;
      controller.enqueue(event.data);
    },
  );
  const outcome = await consume(output);

  return { ...outcome, processedEvents };
}

async function reproduceUserVisibleStreamFailure() {
  const corruptedFrame = createEventStreamFrame({
    messageType: 'event',
    eventType: 'contentBlockDelta',
    data: JSON.stringify({
      contentBlockIndex: 0,
      delta: { text: 'corrupted' },
    }),
  });
  corruptedFrame[corruptedFrame.length - 1] ^= 0xff;

  const laterValidFrame = createEventStreamFrame({
    messageType: 'event',
    eventType: 'contentBlockDelta',
    data: JSON.stringify({
      contentBlockIndex: 0,
      delta: { text: 'valid but stranded' },
    }),
  });

  const model = new AmazonBedrockChatLanguageModel(
    'eu.anthropic.claude-sonnet-4-6',
    {
      baseUrl: () => 'https://bedrock-runtime.eu-central-1.amazonaws.com',
      headers: {},
      generateId: () => 'test-id',
      fetch: async () =>
        new Response(streamFromChunks([corruptedFrame, laterValidFrame]), {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
            'x-amzn-requestid': 'test-request-id',
          },
        }),
    },
  );
  const { stream } = await model.doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ],
    includeRawChunks: false,
  });

  return consume(stream);
}

async function reproduceProcessEventFailure() {
  const validFrame = createEventStreamFrame({
    messageType: 'event',
    eventType: 'contentBlockDelta',
    data: JSON.stringify({
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'valid' },
      },
    }),
  });

  return consume(
    createAmazonBedrockEventStreamDecoder(
      streamFromChunks([validFrame]),
      () => {
        throw new Error('intentional processEvent failure');
      },
    ),
  );
}

async function observeExceptionFrame() {
  const exceptionFrame = createEventStreamFrame({
    messageType: 'exception',
    eventType: 'modelStreamErrorException',
    data: JSON.stringify({
      message: 'modeled streaming exception',
      originalStatusCode: 424,
    }),
  });
  const handler = createAmazonBedrockEventStreamResponseHandler(
    z.object({
      modelStreamErrorException: z.object({
        message: z.string().optional(),
        originalStatusCode: z.number().optional(),
      }),
    }),
  );
  const result = await handler({
    response: new Response(streamFromChunks([exceptionFrame])),
    url: 'https://bedrock-runtime.eu-central-1.amazonaws.com',
    requestBodyValues: {},
  });

  return consume(result.value);
}

async function observeTrailingPartialFrame() {
  const frame = createEventStreamFrame({
    messageType: 'event',
    eventType: 'messageStop',
    data: JSON.stringify({ messageStop: { stopReason: 'end_turn' } }),
  });

  return consume(
    createAmazonBedrockEventStreamDecoder(
      streamFromChunks([frame.subarray(0, -1)]),
      (event, controller) => controller.enqueue(event.data),
    ),
  );
}

async function main() {
  const userVisibleOutcome = await reproduceUserVisibleStreamFailure();
  const corruptFrameOutcome = await reproduceCorruptFrameFailure();
  const processEventOutcome = await reproduceProcessEventFailure();
  const exceptionFrameOutcome = await observeExceptionFrame();
  const partialFrameOutcome = await observeTrailingPartialFrame();
  let failed = false;

  if (userVisibleOutcome.error == null) {
    const finishPart = userVisibleOutcome.values.find(
      part => (part as { type?: string }).type === 'finish',
    );
    const textParts = userVisibleOutcome.values.filter(part =>
      ['text-start', 'text-delta', 'text-end'].includes(
        (part as { type?: string }).type ?? '',
      ),
    );

    console.error(PRIMARY_FAILURE_SIGNAL);
    console.error(
      `The model stream emitted ${userVisibleOutcome.values.length} parts, ${textParts.length} text parts, and finish=${JSON.stringify(finishPart)}.`,
    );
    failed = true;
  }

  console.error(
    `Decoder observation: error surfaced=${corruptFrameOutcome.error != null}, processedEvents=${corruptFrameOutcome.processedEvents}, emittedValues=${corruptFrameOutcome.values.length}.`,
  );

  if (processEventOutcome.error == null) {
    console.error(PROCESS_EVENT_FAILURE_SIGNAL);
    failed = true;
  }

  console.error(
    `Related observation: modeled exception frame closed without output or error=${exceptionFrameOutcome.error == null && exceptionFrameOutcome.values.length === 0}.`,
  );
  console.error(
    `Related observation: trailing partial frame closed without error=${partialFrameOutcome.error == null}.`,
  );

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
