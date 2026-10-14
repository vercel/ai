import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, isStepCount, tool, uploadFile } from 'ai';
import { z } from 'zod';

const modelId = 'claude-haiku-4-5-20251001';
const failureSignal =
  'ISSUE_23259_REPRODUCED: Anthropic tool-result file reference was omitted';

type AnthropicRequest = {
  messages?: Array<{
    role?: string;
    content?: unknown;
  }>;
};

async function verifyDirectAnthropicSupport({
  apiKey,
  fileId,
}: {
  apiKey: string;
  fileId: string;
}) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-beta': 'files-api-2025-04-14',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 32,
      tools: [
        {
          name: 'get_file',
          description: 'Returns the requested text file.',
          input_schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: 'Read the file returned by the tool.',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_issue23259',
              name: 'get_file',
              input: {},
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_issue23259',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'file',
                    file_id: fileId,
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `Direct Anthropic tool-result file reference request failed with HTTP ${response.status}: ${responseBody}`,
    );
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const messageRequests: AnthropicRequest[] = [];

  const anthropic = createAnthropic({
    fetch: async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.endsWith('/messages') && typeof init?.body === 'string') {
        messageRequests.push(JSON.parse(init.body) as AnthropicRequest);
      }

      return fetch(input, init);
    },
  });

  const { providerReference } = await uploadFile({
    api: anthropic.files(),
    data: {
      type: 'text',
      text: 'The verification token is ISSUE-23259-FILE-REFERENCE.',
    },
    filename: 'issue-23259.txt',
    mediaType: 'text/plain',
  });

  const fileId = providerReference.anthropic;
  if (typeof fileId !== 'string') {
    throw new Error('Anthropic upload did not return a file reference.');
  }

  await verifyDirectAnthropicSupport({ apiKey, fileId });

  const result = await generateText({
    model: anthropic(modelId),
    prompt: 'Call getFile, read the returned file, and report its contents.',
    tools: {
      getFile: tool({
        description: 'Returns the text file that must be read.',
        inputSchema: z.object({}),
        execute: async () => ({
          providerReference,
          mediaType: 'text/plain',
        }),
        toModelOutput: ({ output }) => ({
          type: 'content',
          value: [
            {
              type: 'file',
              data: {
                type: 'reference',
                reference: output.providerReference,
              },
              mediaType: output.mediaType,
            },
          ],
        }),
      }),
    },
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? {
            toolChoice: { type: 'tool', toolName: 'getFile' },
          }
        : {
            activeTools: [],
          },
  });

  const secondRequest = messageRequests[1];
  const toolResult = secondRequest?.messages
    ?.flatMap(message =>
      Array.isArray(message.content) ? message.content : [],
    )
    .find(
      (part): part is { type: 'tool_result'; content?: unknown } =>
        typeof part === 'object' &&
        part != null &&
        'type' in part &&
        part.type === 'tool_result',
    );

  const includesFileReference =
    Array.isArray(toolResult?.content) &&
    toolResult.content.some(
      part =>
        typeof part === 'object' &&
        part != null &&
        'type' in part &&
        part.type === 'document' &&
        'source' in part &&
        typeof part.source === 'object' &&
        part.source != null &&
        'type' in part.source &&
        part.source.type === 'file' &&
        'file_id' in part.source &&
        part.source.file_id === fileId,
    );

  if (!includesFileReference) {
    console.error(
      `${failureSignal}. Direct Anthropic accepted the same reference shape, but the AI SDK sent ${JSON.stringify(toolResult?.content)}. Warnings: ${JSON.stringify(result.warnings)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Anthropic tool-result file reference was included in the second Messages API request.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
