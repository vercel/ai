import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';

type ResponsesRequest = {
  input: Array<
    | {
        type: 'function_call_output';
        call_id: string;
        output: unknown;
      }
    | {
        role: string;
        content: unknown;
      }
  >;
};

function getFunctionOutput(request: ResponsesRequest, callId: string) {
  const matchingItem = request.input.find(
    (
      candidate,
    ): candidate is Extract<
      ResponsesRequest['input'][number],
      { type: 'function_call_output' }
    > =>
      'type' in candidate &&
      candidate.type === 'function_call_output' &&
      candidate.call_id === callId,
  );

  if (matchingItem == null || !Array.isArray(matchingItem.output)) {
    throw new Error(`Control failed: missing array output for ${callId}`);
  }

  return matchingItem.output as Array<Record<string, unknown>>;
}

function hasPart(
  output: Array<Record<string, unknown>>,
  expected: Record<string, unknown>,
) {
  return output.some(part =>
    Object.entries(expected).every(([key, value]) => part[key] === value),
  );
}

async function main() {
  let request: ResponsesRequest | undefined;

  const openai = createOpenAI({
    apiKey: 'synthetic-test-key',
    fetch: async (_url, init) => {
      request = JSON.parse(String(init?.body)) as ResponsesRequest;

      return Response.json({
        id: 'resp_synthetic',
        created_at: 0,
        model: 'gpt-4.1',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'msg_synthetic',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      });
    },
  });

  const calls = [
    'pdf-reference',
    'image-reference',
    'mixed-reference',
    'file-data-control',
    'image-data-control',
  ];

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: 'file-user-reference-control',
        },
      ],
    },
    {
      role: 'assistant',
      content: calls.map(callId => ({
        type: 'tool-call' as const,
        toolCallId: callId,
        toolName: 'lookup',
        input: {},
      })),
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'pdf-reference',
          toolName: 'lookup',
          output: {
            type: 'content',
            value: [
              {
                type: 'file-id',
                fileId: { openai: 'file-synthetic-pdf' },
              },
            ],
          },
        },
        {
          type: 'tool-result',
          toolCallId: 'image-reference',
          toolName: 'lookup',
          output: {
            type: 'content',
            value: [
              {
                type: 'image-file-id',
                fileId: { openai: 'file-synthetic-image' },
              },
            ],
          },
        },
        {
          type: 'tool-result',
          toolCallId: 'mixed-reference',
          toolName: 'lookup',
          output: {
            type: 'content',
            value: [
              { type: 'text', text: 'Attached PDF:' },
              {
                type: 'file-id',
                fileId: { openai: 'file-synthetic-mixed' },
              },
            ],
          },
        },
        {
          type: 'tool-result',
          toolCallId: 'file-data-control',
          toolName: 'lookup',
          output: {
            type: 'content',
            value: [
              {
                type: 'file-data',
                mediaType: 'application/pdf',
                data: 'cGRm',
                filename: 'control.pdf',
              },
            ],
          },
        },
        {
          type: 'tool-result',
          toolCallId: 'image-data-control',
          toolName: 'lookup',
          output: {
            type: 'content',
            value: [
              {
                type: 'image-data',
                mediaType: 'image/png',
                data: 'aW1hZ2U=',
              },
            ],
          },
        },
      ],
    },
  ];

  const result = await generateText({
    model: openai.responses('gpt-4.1'),
    messages,
    maxRetries: 0,
  });

  if (request == null) {
    throw new Error('Control failed: OpenAI request was not captured');
  }
  const capturedRequest = request;

  const userMessage = capturedRequest.input.find(
    item => 'role' in item && item.role === 'user',
  ) as { content?: Array<Record<string, unknown>> } | undefined;
  if (
    !userMessage?.content?.some(
      part =>
        part.type === 'input_file' &&
        part.file_id === 'file-user-reference-control',
    )
  ) {
    throw new Error('Control failed: user-message file reference was not sent');
  }

  const controlExpectations = [
    {
      callId: 'file-data-control',
      part: {
        type: 'input_file',
        file_data: 'data:application/pdf;base64,cGRm',
      },
    },
    {
      callId: 'image-data-control',
      part: {
        type: 'input_image',
        image_url: 'data:image/png;base64,aW1hZ2U=',
      },
    },
    {
      callId: 'mixed-reference',
      part: { type: 'input_text', text: 'Attached PDF:' },
    },
  ];

  for (const { callId, part } of controlExpectations) {
    if (!hasPart(getFunctionOutput(capturedRequest, callId), part)) {
      throw new Error(
        `Control failed: expected content was not sent for ${callId}`,
      );
    }
  }

  const primaryExpectations = [
    {
      callId: 'pdf-reference',
      part: { type: 'input_file', file_id: 'file-synthetic-pdf' },
    },
    {
      callId: 'image-reference',
      part: { type: 'input_image', file_id: 'file-synthetic-image' },
    },
    {
      callId: 'mixed-reference',
      part: { type: 'input_file', file_id: 'file-synthetic-mixed' },
    },
  ];

  const missingReferences = primaryExpectations.filter(
    ({ callId, part }) =>
      !hasPart(getFunctionOutput(capturedRequest, callId), part),
  );

  console.log('Warnings:', result.warnings);
  console.log(
    'Function outputs:',
    JSON.stringify(capturedRequest.input, null, 2),
  );

  if (missingReferences.length > 0) {
    throw new Error(
      'OpenAI Responses dropped provider-referenced tool files from function_call_output.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
