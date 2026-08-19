import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type {
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';

const EXPECTED_ERROR_MESSAGE = 'Model Stream Error';
const REPRODUCTION_SIGNAL =
  'ISSUE_19034_REPRODUCED: modeled Bedrock exception was dropped; expected an error part and finishReason "error", received no error part and finishReason "other".';

const textEncoder = new TextEncoder();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function encodeStringHeader(name: string, value: string): Uint8Array {
  const nameBytes = textEncoder.encode(name);
  const valueBytes = textEncoder.encode(value);
  const header = new Uint8Array(
    1 + nameBytes.length + 1 + 2 + valueBytes.length,
  );
  const view = new DataView(header.buffer);

  header[0] = nameBytes.length;
  header.set(nameBytes, 1);
  header[1 + nameBytes.length] = 7;
  view.setUint16(2 + nameBytes.length, valueBytes.length, false);
  header.set(valueBytes, 4 + nameBytes.length);

  return header;
}

function encodeModeledExceptionFrame(): Uint8Array {
  const headers = [
    encodeStringHeader(':message-type', 'exception'),
    encodeStringHeader(':exception-type', 'modelStreamErrorException'),
    encodeStringHeader(':content-type', 'application/json'),
  ];
  const headersLength = headers.reduce(
    (length, header) => length + header.length,
    0,
  );
  const payload = textEncoder.encode(
    JSON.stringify({
      message: EXPECTED_ERROR_MESSAGE,
      originalStatusCode: 500,
      originalMessage: 'The model stream failed.',
    }),
  );
  const totalLength = 12 + headersLength + payload.length + 4;
  const frame = new Uint8Array(totalLength);
  const view = new DataView(frame.buffer);

  view.setUint32(0, totalLength, false);
  view.setUint32(4, headersLength, false);
  view.setUint32(8, crc32(frame.subarray(0, 8)), false);

  let offset = 12;
  for (const header of headers) {
    frame.set(header, offset);
    offset += header.length;
  }
  frame.set(payload, offset);
  view.setUint32(
    totalLength - 4,
    crc32(frame.subarray(0, totalLength - 4)),
    false,
  );

  return frame;
}

function createResponseBody(frame: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(frame);
      controller.close();
    },
  });
}

async function main() {
  const frame = encodeModeledExceptionFrame();
  const bedrock = createAmazonBedrock({
    apiKey: 'reproduction-api-key',
    region: 'us-east-1',
    fetch: async () =>
      new Response(createResponseBody(frame), {
        status: 200,
        headers: {
          'content-type': 'application/vnd.amazon.eventstream',
        },
      }),
  });
  const model = bedrock('anthropic.claude-3-haiku-20240307-v1:0');
  const prompt: LanguageModelV3Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];

  const { stream } = await model.doStream({
    prompt,
    includeRawChunks: false,
  });
  const parts: LanguageModelV3StreamPart[] = [];

  for await (const part of stream) {
    parts.push(part);
  }

  const errorPart = parts.find(part => part.type === 'error');
  const finishPart = parts.find(part => part.type === 'finish');

  if (
    errorPart?.type === 'error' &&
    (errorPart.error as { message?: string }).message ===
      EXPECTED_ERROR_MESSAGE &&
    finishPart?.type === 'finish' &&
    finishPart.finishReason.unified === 'error'
  ) {
    console.log(
      'Modeled Bedrock exception surfaced as an error part with finishReason "error".',
    );
    return;
  }

  if (
    errorPart == null &&
    finishPart?.type === 'finish' &&
    finishPart.finishReason.unified === 'other'
  ) {
    console.error(REPRODUCTION_SIGNAL);
    process.exitCode = 1;
    return;
  }

  console.error(
    `Unexpected stream result: ${JSON.stringify(
      parts.map(part =>
        part.type === 'finish'
          ? { type: part.type, finishReason: part.finishReason.unified }
          : { type: part.type },
      ),
    )}`,
  );
  process.exitCode = 2;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
