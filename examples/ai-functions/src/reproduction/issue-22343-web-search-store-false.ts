import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

type WebSearchAction =
  | {
      type: 'search';
      query: string;
      sources: Array<{ type: 'url'; url: string }>;
    }
  | { type: 'open_page'; url: string }
  | { type: 'find_in_page'; url: string; pattern: string };

type TestCase = {
  name: string;
  toolName: 'web_search' | 'web_search_preview';
  action: WebSearchAction;
};

const usage = {
  input_tokens: 1,
  output_tokens: 1,
  total_tokens: 2,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 0 },
};

function respond(id: string, output: Array<Record<string, unknown>>) {
  return Response.json({
    id,
    created_at: 1,
    model: 'gpt-5-mini',
    status: 'completed',
    output,
    usage,
  });
}

function expectedAction(action: WebSearchAction) {
  switch (action.type) {
    case 'search':
      return action;
    case 'open_page':
      return action;
    case 'find_in_page':
      return action;
  }
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}

async function runCase(testCase: TestCase) {
  const requests: Array<{
    input: Array<Record<string, unknown>>;
  }> = [];

  const openai = createOpenAI({
    apiKey: 'test',
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init?.body as string));

      return requests.length === 1
        ? respond('resp_1', [
            {
              type: 'web_search_call',
              id: `ws_${testCase.name}`,
              status: 'completed',
              action: testCase.action,
            },
            {
              type: 'function_call',
              id: `fc_${testCase.name}`,
              call_id: `call_${testCase.name}`,
              name: 'send_message',
              arguments: '{"text":"The mayor is ..."}',
              status: 'completed',
            },
          ])
        : respond('resp_2', [
            {
              type: 'message',
              id: `msg_${testCase.name}`,
              role: 'assistant',
              status: 'completed',
              content: [
                { type: 'output_text', text: 'Done.', annotations: [] },
              ],
            },
          ]);
    },
  });

  const webSearchTool =
    testCase.toolName === 'web_search'
      ? openai.tools.webSearch({})
      : openai.tools.webSearchPreview({});

  const result = await generateText({
    model: openai('gpt-5-mini'),
    providerOptions: { openai: { store: false } },
    tools: {
      [testCase.toolName]: webSearchTool,
      send_message: tool({
        inputSchema: z.object({ text: z.string() }),
        execute: async () => ({ sent: true }),
      }),
    },
    stopWhen: stepCountIs(2),
    prompt: 'Who is the mayor of Paris? Search, then send the answer.',
  });

  const secondInput = requests[1]?.input ?? [];
  const replay = secondInput.find(item => item.type === 'web_search_call');

  console.log(`Case: ${testCase.name}`);
  console.log(`Second request input: ${JSON.stringify(secondInput)}`);
  console.log(
    `Second step warnings: ${JSON.stringify(result.steps[1]?.warnings ?? [])}`,
  );

  const expected = {
    type: 'web_search_call',
    id: `ws_${testCase.name}`,
    status: 'completed',
    action: expectedAction(testCase.action),
  };

  return canonicalize(replay) === canonicalize(expected);
}

async function main() {
  const cases: TestCase[] = [
    {
      name: 'web_search_search',
      toolName: 'web_search',
      action: {
        type: 'search',
        query: 'mayor of Paris',
        sources: [{ type: 'url', url: 'https://www.paris.fr' }],
      },
    },
    {
      name: 'web_search_preview_search',
      toolName: 'web_search_preview',
      action: {
        type: 'search',
        query: 'mayor of Paris',
        sources: [{ type: 'url', url: 'https://www.paris.fr' }],
      },
    },
    {
      name: 'web_search_open_page',
      toolName: 'web_search',
      action: {
        type: 'open_page',
        url: 'https://www.paris.fr',
      },
    },
    {
      name: 'web_search_find_in_page',
      toolName: 'web_search',
      action: {
        type: 'find_in_page',
        url: 'https://www.paris.fr',
        pattern: 'mayor',
      },
    },
  ];

  const results = [];
  for (const testCase of cases) {
    results.push(await runCase(testCase));
  }

  if (results.some(replayed => !replayed)) {
    console.error(
      'ISSUE_22343_PRIMARY_FAILURE: stateless web search context was omitted from the second Responses API request',
    );
    process.exitCode = 1;
    return;
  }

  console.log('All stateless web search results were replayed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
