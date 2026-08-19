import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject, generateText, streamText, tool } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { convertToBedrockChatMessages } from '../../../../packages/amazon-bedrock/src/convert-to-bedrock-chat-messages';

const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/amazon-bedrock/src/__fixtures__',
);
const responseFixture = JSON.parse(
  fs.readFileSync(
    path.join(fixtureDirectory, 'amazon-bedrock-redacted-content.json'),
    'utf8',
  ),
);
const streamFixture = fs
  .readFileSync(
    path.join(fixtureDirectory, 'amazon-bedrock-redacted-content.chunks.txt'),
    'utf8',
  )
  .trim()
  .split('\n')
  .map(line => JSON.parse(line));

const responseRedactedContent =
  responseFixture.output.message.content[0].reasoningContent.redactedContent;
const streamRedactedContent =
  streamFixture[1].contentBlockDelta.delta.reasoningContent.redactedContent;

const groupSchema = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      parentGroupName: z.string(),
    }),
  ),
});
const expectedGroups = {
  groups: [
    { name: 'Sales', parentGroupName: '' },
    { name: 'Team1', parentGroupName: 'Sales' },
  ],
};
const prompt =
  'Transcribe this CSV, preserving order.\nname,parent\nSales,\nTeam1,Sales';

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function encodeStringHeader(name: string, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const valueBytes = encoder.encode(value);
  const result = new Uint8Array(
    1 + nameBytes.length + 1 + 2 + valueBytes.length,
  );
  const view = new DataView(result.buffer);

  result[0] = nameBytes.length;
  result.set(nameBytes, 1);
  result[1 + nameBytes.length] = 7;
  view.setUint16(2 + nameBytes.length, valueBytes.length, false);
  result.set(valueBytes, 4 + nameBytes.length);

  return result;
}

function encodeEvent(event: Record<string, unknown>): Uint8Array {
  const eventType = Object.keys(event)[0];
  const encoder = new TextEncoder();
  const payload = encoder.encode(JSON.stringify(event[eventType]));
  const headers = [
    encodeStringHeader(':message-type', 'event'),
    encodeStringHeader(':event-type', eventType),
  ];
  const headersLength = headers.reduce((sum, header) => sum + header.length, 0);
  const totalLength = 16 + headersLength + payload.length;
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
  view.setUint32(totalLength - 4, crc32(frame.subarray(0, -4)), false);

  return frame;
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

function createFixtureModel({ stream = false }: { stream?: boolean } = {}) {
  const provider = createAmazonBedrock({
    apiKey: 'fixture-api-key',
    region: 'us-east-1',
    fetch: async () =>
      stream
        ? new Response(concatenate(streamFixture.map(encodeEvent)), {
            status: 200,
            headers: {
              'content-type': 'application/vnd.amazon.eventstream',
            },
          })
        : new Response(JSON.stringify(responseFixture), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
  });

  return provider('us.openai.gpt-5.6-luna');
}

function contains(value: unknown, expected: string): boolean {
  return JSON.stringify(value).includes(expected);
}

async function main() {
  const failures: string[] = [];

  try {
    const result = await generateText({
      model: createFixtureModel(),
      tools: {
        json: tool({
          description: 'finalize the draft',
          inputSchema: groupSchema,
        }),
      },
      toolChoice: 'required',
      prompt,
      maxRetries: 0,
    });

    if (
      JSON.stringify(result.toolCalls[0]?.input) !==
      JSON.stringify(expectedGroups)
    ) {
      failures.push('generateText did not return the recorded tool call');
    }
    if (!contains(result.content, responseRedactedContent)) {
      failures.push(
        'generateText did not surface reasoningContent.redactedContent',
      );
    }
  } catch (error) {
    failures.push(
      `generateText rejected the HTTP 200 response: ${(error as Error).message}`,
    );
  }

  try {
    const result = await generateObject({
      model: createFixtureModel(),
      schema: groupSchema,
      prompt,
      maxRetries: 0,
    });

    if (JSON.stringify(result.object) !== JSON.stringify(expectedGroups)) {
      failures.push('generateObject did not return the recorded object');
    }
  } catch (error) {
    failures.push(
      `generateObject rejected the HTTP 200 response: ${(error as Error).message}`,
    );
  }

  try {
    const parts: unknown[] = [];
    const result = streamText({
      model: createFixtureModel({ stream: true }),
      tools: {
        propose: tool({
          description: 'finalize the draft',
          inputSchema: groupSchema,
        }),
      },
      toolChoice: 'required',
      prompt,
      maxRetries: 0,
      onError() {},
    });

    for await (const part of result.fullStream) {
      parts.push(part);
    }

    const errorParts = parts.filter(
      part => (part as { type?: string }).type === 'error',
    );
    const nonErrorParts = parts.filter(
      part => (part as { type?: string }).type !== 'error',
    );
    const toolCall = parts.find(
      part => (part as { type?: string }).type === 'tool-call',
    ) as { input?: unknown } | undefined;

    if (errorParts.length > 0) {
      failures.push(
        'streamText emitted an error part for the documented delta',
      );
    }
    if (JSON.stringify(toolCall?.input) !== JSON.stringify(expectedGroups)) {
      failures.push('streamText did not continue to the recorded tool call');
    }
    if (!contains(nonErrorParts, streamRedactedContent)) {
      failures.push(
        'streamText lost reasoningContent.redactedContent instead of surfacing it',
      );
    }
  } catch (error) {
    failures.push(`streamText failed: ${(error as Error).message}`);
  }

  const converted = await convertToBedrockChatMessages([
    {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: '',
          providerOptions: {
            bedrock: { redactedContent: responseRedactedContent },
          },
        },
      ],
    },
  ] as any);

  if (!contains(converted.messages, responseRedactedContent)) {
    failures.push(
      'assistant reasoningContent.redactedContent was not replayed verbatim',
    );
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE #19062 REPRODUCED: documented Bedrock reasoningContent.redactedContent is rejected, lost, or not replayed',
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #19062 not reproduced: redacted reasoning was accepted, surfaced, and replayed.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
