import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject, generateText, streamText, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';
import { EventStreamCodec } from '../../../../packages/amazon-bedrock/node_modules/@smithy/eventstream-codec';
import { convertToBedrockChatMessages } from '../../../../packages/amazon-bedrock/src/convert-to-bedrock-chat-messages';

const region = 'us-east-1';
const modelId = 'us.openai.gpt-5.6-luna';
const fixtureDirectory = '../../packages/amazon-bedrock/src/__fixtures__';
const redactedContent = 'cnNuX3BVUGgxNnRvNFZLWURnSkFQeW1iRUFJRmVD';
const prompt =
  'Transcribe this CSV, preserving order.\nname,parent\nSales,\nTeam1,Sales';
const groupsSchema = z.array(
  z.object({
    name: z.string(),
    parentGroupName: z.string(),
  }),
);
const expectedGroups = [
  { name: 'Sales', parentGroupName: '' },
  { name: 'Team1', parentGroupName: 'Sales' },
];

const propose = tool({
  description: 'finalize the draft',
  inputSchema: z.object({ groups: groupsSchema }),
});

function createEventStreamResponse() {
  const codec = new EventStreamCodec(
    value => new TextDecoder().decode(value),
    value => new TextEncoder().encode(value),
  );
  const frames = fs
    .readFileSync(
      `${fixtureDirectory}/amazon-bedrock-redacted-content.chunks.txt`,
      'utf8',
    )
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const wrappedEvent = JSON.parse(line);
      const [eventType, body] = Object.entries(wrappedEvent)[0];
      return codec.encode({
        headers: {
          ':message-type': { type: 'string', value: 'event' },
          ':event-type': { type: 'string', value: eventType },
        },
        body: new TextEncoder().encode(JSON.stringify(body)),
      });
    });

  return new Response(new Blob(frames).stream(), {
    status: 200,
    headers: { 'content-type': 'application/vnd.amazon.eventstream' },
  });
}

async function replayFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  if (url.endsWith('/converse-stream')) {
    return createEventStreamResponse();
  }

  const fixture = JSON.parse(
    fs.readFileSync(
      `${fixtureDirectory}/amazon-bedrock-redacted-content.json`,
      'utf8',
    ),
  );
  const requestBody = JSON.parse(String(init?.body));
  const requestedToolName =
    requestBody.toolConfig?.tools?.[0]?.toolSpec?.name ?? 'propose';
  fixture.output.message.content[1].toolUse.name = requestedToolName;

  return Response.json(fixture);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    const cause =
      'cause' in error && error.cause instanceof Error
        ? ` cause=${error.cause.name}:${error.cause.message}`
        : '';
    return `${error.name}:${error.message}${cause}`;
  }
  return String(error);
}

async function main() {
  const model = createAmazonBedrock({
    region,
    apiKey: 'fixture-replay',
    fetch: replayFetch,
  })(modelId);
  const failures: string[] = [];

  try {
    const result = await generateText({
      model,
      tools: { propose },
      toolChoice: 'required',
      prompt,
    });
    const groups = result.toolCalls[0]?.input.groups;
    if (JSON.stringify(groups) !== JSON.stringify(expectedGroups)) {
      failures.push('generateText did not return the expected tool call');
    }
    const reasoning = result.content.find(part => part.type === 'reasoning');
    if (
      reasoning?.providerMetadata?.bedrock?.redactedContent !== redactedContent
    ) {
      failures.push('generateText did not surface redactedContent');
    }
    console.log('[generateText] accepted the response');
  } catch (error) {
    failures.push(
      `generateText rejected HTTP 200 response: ${formatError(error)}`,
    );
  }

  try {
    const result = await generateObject({
      model,
      schema: z.object({ groups: groupsSchema }),
      prompt,
    });
    if (
      JSON.stringify(result.object.groups) !== JSON.stringify(expectedGroups)
    ) {
      failures.push('generateObject did not return the expected object');
    }
    console.log('[generateObject] accepted the response');
  } catch (error) {
    failures.push(
      `generateObject rejected HTTP 200 response: ${formatError(error)}`,
    );
  }

  try {
    const result = streamText({
      model,
      tools: { propose },
      toolChoice: 'required',
      prompt,
    });
    const errors: unknown[] = [];
    let groups: unknown;
    let streamedRedactedContent: unknown;

    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        errors.push(part.error);
      } else if (part.type === 'tool-call' && part.toolName === 'propose') {
        groups = part.input.groups;
      } else if (
        part.type === 'reasoning-delta' &&
        part.providerMetadata?.bedrock?.redactedContent != null
      ) {
        streamedRedactedContent = part.providerMetadata.bedrock.redactedContent;
      }
    }

    if (errors.length > 0) {
      failures.push(
        `streamText emitted an error part: ${errors.map(formatError).join(' | ')}`,
      );
    }
    if (JSON.stringify(groups) !== JSON.stringify(expectedGroups)) {
      failures.push('streamText did not return the expected tool call');
    }
    if (streamedRedactedContent !== redactedContent) {
      failures.push('streamText did not surface redactedContent');
    }
    console.log('[streamText] stream completed');
  } catch (error) {
    failures.push(`streamText threw: ${formatError(error)}`);
  }

  const converted = await convertToBedrockChatMessages([
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: '',
          providerOptions: {
            bedrock: {
              redactedContent,
            },
          },
        },
      ],
    },
  ]);
  const replayedReasoningContent =
    converted.messages[0]?.content[0]?.reasoningContent;
  if (
    replayedReasoningContent == null ||
    !('redactedContent' in replayedReasoningContent) ||
    replayedReasoningContent.redactedContent !== redactedContent
  ) {
    failures.push('subsequent turns did not replay redactedContent verbatim');
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    throw new Error(
      'ISSUE_19062_REPRODUCED: valid Bedrock redactedContent breaks AI SDK tool calls',
    );
  }

  console.log(
    'All Bedrock redactedContent response paths completed without validation errors.',
  );
}

main().catch(error => {
  console.error(formatError(error));
  process.exitCode = 1;
});
