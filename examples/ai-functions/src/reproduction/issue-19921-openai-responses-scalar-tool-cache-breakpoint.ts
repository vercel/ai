import { createOpenAI } from '@ai-sdk/openai';
import type {
  LanguageModelV4ToolResultOutput,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import { generateText, type ModelMessage } from 'ai';

const promptCacheBreakpoint = { mode: 'explicit' } as const;
const providerOptions = {
  openai: { promptCacheBreakpoint },
};

const scalarCases: Array<{
  output: LanguageModelV4ToolResultOutput;
  expectedText: string;
}> = [
  {
    output: { type: 'text', value: 'stable tool output' },
    expectedText: 'stable tool output',
  },
  {
    output: { type: 'json', value: { stable: true } },
    expectedText: '{"stable":true}',
  },
  {
    output: { type: 'error-text', value: 'tool error' },
    expectedText: 'tool error',
  },
  {
    output: { type: 'error-json', value: { error: 'boom' } },
    expectedText: '{"error":"boom"}',
  },
  {
    output: { type: 'execution-denied', reason: 'execution denied' },
    expectedText: 'execution denied',
  },
];

async function captureFunctionCallOutput(
  toolResult: LanguageModelV4ToolResultPart,
): Promise<unknown> {
  let requestBody: { input?: Array<Record<string, unknown>> } | undefined;

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

  const messages: ModelMessage[] = [
    { role: 'user', content: 'Run the lookup' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          input: {},
        },
      ],
    },
    { role: 'tool', content: [toolResult] },
  ];

  await generateText({
    model: openai.responses('gpt-5.6'),
    messages,
    maxRetries: 0,
    providerOptions: {
      openai: {
        promptCacheOptions: { mode: 'explicit', ttl: '30m' },
      },
    },
  }).catch(() => undefined);

  if (requestBody == null) {
    throw new Error('The OpenAI request was not captured.');
  }

  const functionCallOutput = requestBody.input?.find(
    item => item.type === 'function_call_output',
  );

  if (functionCallOutput == null) {
    throw new Error('The request did not contain a function_call_output item.');
  }

  return functionCallOutput.output;
}

async function main() {
  const failures: string[] = [];

  for (const [index, scalarCase] of scalarCases.entries()) {
    for (const placement of ['output', 'tool-result'] as const) {
      const output =
        placement === 'output'
          ? ({
              ...scalarCase.output,
              providerOptions,
            } as LanguageModelV4ToolResultOutput)
          : scalarCase.output;

      const actualOutput = await captureFunctionCallOutput({
        type: 'tool-result',
        toolCallId: `call_${index}_${placement}`,
        toolName: 'lookup',
        output,
        ...(placement === 'tool-result' && { providerOptions }),
      });

      const expectedOutput = [
        {
          type: 'input_text',
          text: scalarCase.expectedText,
          prompt_cache_breakpoint: promptCacheBreakpoint,
        },
      ];

      if (JSON.stringify(actualOutput) !== JSON.stringify(expectedOutput)) {
        failures.push(
          `${scalarCase.output.type}/${placement}: ${JSON.stringify(actualOutput)}`,
        );
      }
    }
  }

  const controlOutput = await captureFunctionCallOutput({
    type: 'tool-result',
    toolCallId: 'call_control',
    toolName: 'lookup',
    output: {
      type: 'content',
      value: [
        {
          type: 'text',
          text: 'stable tool output',
          providerOptions,
        },
      ],
    },
  });

  const expectedControlOutput = [
    {
      type: 'input_text',
      text: 'stable tool output',
      prompt_cache_breakpoint: promptCacheBreakpoint,
    },
  ];

  if (JSON.stringify(controlOutput) !== JSON.stringify(expectedControlOutput)) {
    throw new Error(
      `The content-output control did not preserve the breakpoint: ${JSON.stringify(controlOutput)}`,
    );
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_19921_REPRODUCED: OpenAI Responses dropped promptCacheBreakpoint from scalar tool results',
    );
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
