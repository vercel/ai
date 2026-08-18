import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

const failureSignal =
  'ISSUE_19034_REPRODUCED: Amazon Bedrock modeled exception frame was dropped';
const textEncoder = new TextEncoder();

function concatenate(chunks: Uint8Array[]) {
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

function encodeStringHeader(name: string, value: string) {
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

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function encodeEventStreamFrame({
  headers,
  payload,
}: {
  headers: Record<string, string>;
  payload: unknown;
}) {
  const encodedHeaders = concatenate(
    Object.entries(headers).map(([name, value]) =>
      encodeStringHeader(name, value),
    ),
  );
  const encodedPayload = textEncoder.encode(JSON.stringify(payload));
  const totalLength = 16 + encodedHeaders.length + encodedPayload.length;
  const frame = new Uint8Array(totalLength);
  const view = new DataView(frame.buffer);

  view.setUint32(0, totalLength, false);
  view.setUint32(4, encodedHeaders.length, false);
  view.setUint32(8, crc32(frame.subarray(0, 8)), false);
  frame.set(encodedHeaders, 12);
  frame.set(encodedPayload, 12 + encodedHeaders.length);
  view.setUint32(
    totalLength - 4,
    crc32(frame.subarray(0, totalLength - 4)),
    false,
  );

  return frame;
}

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Hello' }],
  },
];

async function main() {
  const exceptionPayload = {
    message: 'An error occurred while streaming the response.',
    originalMessage: 'The model stream failed.',
    originalStatusCode: 424,
  };

  const exceptionFrame = encodeEventStreamFrame({
    headers: {
      ':message-type': 'exception',
      ':exception-type': 'modelStreamErrorException',
      ':content-type': 'application/json',
    },
    payload: exceptionPayload,
  });

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(exceptionFrame);
            controller.close();
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
            'x-amzn-requestid': 'issue-19034',
          },
        },
      ),
  });

  const result = await bedrock(
    'anthropic.claude-3-haiku-20240307-v1:0',
  ).doStream({
    prompt,
  });

  const parts: LanguageModelV4StreamPart[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }

  const errorPart = parts.find(part => part.type === 'error');
  const finishPart = parts.find(part => part.type === 'finish');

  if (errorPart == null || finishPart?.finishReason.unified !== 'error') {
    console.error(failureSignal);
    console.error(JSON.stringify(parts, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    'Modeled exception surfaced as an error part with finish reason error.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
