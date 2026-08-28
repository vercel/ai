import { createOpenAI } from '@ai-sdk/openai';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import { generateText, type ModelMessage } from 'ai';

const promptCacheBreakpoint = { mode: 'explicit' } as const;

type ScalarToolResultOutput = Exclude<ToolResultOutput, { type: 'content' }>;

const scalarOutputs: Array<{
  output: ScalarToolResultOutput;
  serializedValue: string;
}> = [
  {
    output: { type: 'text', value: 'stable tool output' },
    serializedValue: 'stable tool output',
  },
  {
    output: { type: 'json', value: { result: 'stable tool output' } },
    serializedValue: '{"result":"stable tool output"}',
  },
  {
    output: { type: 'error-text', value: 'stable tool error' },
    serializedValue: 'stable tool error',
  },
  {
    output: { type: 'error-json', value: { error: 'stable tool error' } },
    serializedValue: '{"error":"stable tool error"}',
  },
  {
    output: { type: 'execution-denied', reason: 'stable denial reason' },
    serializedValue: 'stable denial reason',
  },
];

type RequestInputItem = {
  type?: string;
  call_id?: string;
  output?: unknown;
};

async function captureToolResultOutput({
  output,
  placement,
}: {
  output: ToolResultOutput;
  placement: 'output' | 'tool-result';
}) {
  let requestBody: { input?: Array<RequestInputItem> } | undefined;

  const openai = createOpenAI({
    apiKey: 'test',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ error: { message: 'stop after capturing request' } }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const outputWithOptions =
    placement === 'output'
      ? {
          ...output,
          providerOptions: { openai: { promptCacheBreakpoint } },
        }
      : output;

  const messages: ModelMessage[] = [
    { role: 'user', content: 'Run the lookup' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call_1',
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
          toolCallId: 'call_1',
          toolName: 'lookup',
          output: outputWithOptions,
          ...(placement === 'tool-result' && {
            providerOptions: { openai: { promptCacheBreakpoint } },
          }),
        },
      ],
    },
  ];

  await generateText({
    model: openai.responses('gpt-5.6'),
    messages,
    providerOptions: {
      openai: {
        promptCacheOptions: { mode: 'explicit', ttl: '30m' },
      },
    },
  }).catch(() => undefined);

  const functionCallOutput = requestBody?.input?.find(
    item => item.type === 'function_call_output' && item.call_id === 'call_1',
  );

  if (functionCallOutput == null) {
    throw new Error('Harness failed to capture function_call_output');
  }

  return functionCallOutput.output;
}

async function main() {
  const failures: Array<string> = [];

  for (const { output, serializedValue } of scalarOutputs) {
    for (const placement of ['output', 'tool-result'] as const) {
      const actualOutput = await captureToolResultOutput({
        output,
        placement,
      });
      const expectedOutput = [
        {
          type: 'input_text',
          text: serializedValue,
          prompt_cache_breakpoint: promptCacheBreakpoint,
        },
      ];

      if (JSON.stringify(actualOutput) !== JSON.stringify(expectedOutput)) {
        failures.push(
          `${output.type}/${placement}: ${JSON.stringify(actualOutput)}`,
        );
      }
    }
  }

  const contentControl = await captureToolResultOutput({
    output: {
      type: 'content',
      value: [
        {
          type: 'text',
          text: 'stable tool output',
          providerOptions: { openai: { promptCacheBreakpoint } },
        },
      ],
    },
    placement: 'output',
  });
  const expectedControl = [
    {
      type: 'input_text',
      text: 'stable tool output',
      prompt_cache_breakpoint: promptCacheBreakpoint,
    },
  ];

  if (JSON.stringify(contentControl) !== JSON.stringify(expectedControl)) {
    throw new Error(
      `Content-output control did not preserve the breakpoint: ${JSON.stringify(contentControl)}`,
    );
  }

  if (failures.length > 0) {
    console.error(
      `ISSUE_19921_REPRODUCED: ${failures.length}/10 scalar tool results dropped promptCacheBreakpoint`,
    );
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
