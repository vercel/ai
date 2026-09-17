import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV4ToolResultOutput } from '@ai-sdk/provider';
import { generateText, type ModelMessage } from 'ai';
import assert from 'node:assert/strict';

const syntheticResponse = {
  id: 'resp_synthetic',
  created_at: 0,
  model: 'gpt-4.1',
  status: 'completed',
  output: [
    {
      type: 'message',
      id: 'msg_synthetic',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
    },
  ],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
};

async function captureRequest(messages: ModelMessage[]) {
  let requestBody: any;

  const openai = createOpenAI({
    apiKey: 'synthetic-test-key',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json(syntheticResponse);
    },
  });

  const result = await generateText({
    model: openai.responses('gpt-4.1'),
    messages,
    maxRetries: 0,
  });

  return { requestBody, warnings: result.warnings };
}

function toolMessages(
  value: Extract<LanguageModelV4ToolResultOutput, { type: 'content' }>['value'],
): ModelMessage[] {
  return [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-synthetic',
          toolName: 'lookup',
          input: {},
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-synthetic',
          toolName: 'lookup',
          output: { type: 'content', value },
        },
      ],
    },
  ];
}

function functionOutput(requestBody: any): any[] {
  return requestBody.input.find(
    (item: any) => item.type === 'function_call_output',
  ).output;
}

async function main() {
  const pdfReference = await captureRequest(
    toolMessages([
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: {
          type: 'reference',
          reference: { openai: 'file-pdf-synthetic' },
        },
      },
    ]),
  );

  const imageReference = await captureRequest(
    toolMessages([
      {
        type: 'file',
        mediaType: 'image/png',
        data: {
          type: 'reference',
          reference: { openai: 'file-image-synthetic' },
        },
      },
    ]),
  );

  const mixedReference = await captureRequest(
    toolMessages([
      { type: 'text', text: 'The tool returned this document:' },
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: {
          type: 'reference',
          reference: { openai: 'file-mixed-synthetic' },
        },
      },
    ]),
  );

  const userReference = await captureRequest([
    {
      role: 'user',
      content: [
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: {
            type: 'reference',
            reference: { openai: 'file-user-control' },
          },
        },
      ],
    },
  ]);

  const urlControl = await captureRequest(
    toolMessages([
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: {
          type: 'url',
          url: new URL('https://example.com/document.pdf'),
        },
      },
    ]),
  );

  const inlineControl = await captureRequest(
    toolMessages([
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: 'AQIDBAU=' },
      },
    ]),
  );

  assert.ok(
    userReference.requestBody.input[0].content.some(
      (part: any) =>
        part.type === 'input_file' && part.file_id === 'file-user-control',
    ),
    'Control failed: user-message provider reference was not sent as input_file.file_id',
  );
  assert.ok(
    functionOutput(urlControl.requestBody).some(
      part =>
        part.type === 'input_file' &&
        part.file_url === 'https://example.com/document.pdf',
    ),
    'Control failed: tool-result file URL was not sent',
  );
  assert.ok(
    functionOutput(inlineControl.requestBody).some(
      part =>
        part.type === 'input_image' &&
        part.image_url === 'data:image/png;base64,AQIDBAU=',
    ),
    'Control failed: inline tool-result image bytes were not sent',
  );

  const failures = [
    {
      name: 'PDF reference',
      expected: { type: 'input_file', file_id: 'file-pdf-synthetic' },
      actual: functionOutput(pdfReference.requestBody),
      warnings: pdfReference.warnings,
    },
    {
      name: 'image reference',
      expected: { type: 'input_image', file_id: 'file-image-synthetic' },
      actual: functionOutput(imageReference.requestBody),
      warnings: imageReference.warnings,
    },
    {
      name: 'mixed text and PDF reference',
      expected: { type: 'input_file', file_id: 'file-mixed-synthetic' },
      actual: functionOutput(mixedReference.requestBody),
      warnings: mixedReference.warnings,
    },
  ].filter(
    testCase =>
      !testCase.actual.some(
        part =>
          part.type === testCase.expected.type &&
          part.file_id === testCase.expected.file_id,
      ),
  );

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_20971: OpenAI Responses dropped provider-referenced file content from function_call_output\n${JSON.stringify(
        failures,
        null,
        2,
      )}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
