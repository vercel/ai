import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

type OpenAIInputItem = {
  type?: string;
  id?: string;
  status?: string;
  action?: unknown;
};

type WebSearchAction =
  | {
      type: 'search';
      query: string;
      sources?: Array<{ type: 'url'; url: string }>;
    }
  | { type: 'open_page'; url: string }
  | { type: 'find_in_page'; url: string; pattern: string };

const usage = {
  input_tokens: 1,
  output_tokens: 1,
  total_tokens: 2,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 0 },
};

const respond = (id: string, output: Array<Record<string, unknown>>) =>
  Response.json({
    id,
    created_at: 1,
    model: 'gpt-5-mini',
    status: 'completed',
    output,
    usage,
  });

async function runReplayCase({
  toolVariant,
  responseAction,
  expectedAction,
  store = false,
}: {
  toolVariant: 'web_search' | 'web_search_preview';
  responseAction?: WebSearchAction;
  expectedAction?: WebSearchAction;
  store?: boolean;
}) {
  const requests: Array<{ input: OpenAIInputItem[] }> = [];
  const webSearchCall = {
    type: 'web_search_call',
    id: `ws_${toolVariant}`,
    status: 'completed',
    ...(responseAction == null ? {} : { action: responseAction }),
  };

  const openai = createOpenAI({
    apiKey: 'test',
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init?.body as string));

      return requests.length === 1
        ? respond('resp_1', [
            webSearchCall,
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'send_message',
              arguments: '{"text":"The mayor is ..."}',
              status: 'completed',
            },
          ])
        : respond('resp_2', [
            {
              type: 'message',
              id: 'msg_2',
              role: 'assistant',
              status: 'completed',
              content: [
                { type: 'output_text', text: 'Done.', annotations: [] },
              ],
            },
          ]);
    },
  });

  const result = await generateText({
    model: openai('gpt-5-mini'),
    providerOptions: { openai: { store } },
    tools: {
      [toolVariant]:
        toolVariant === 'web_search'
          ? openai.tools.webSearch({})
          : openai.tools.webSearchPreview({}),
      send_message: tool({
        inputSchema: z.object({ text: z.string() }),
        execute: async () => ({ sent: true }),
      }),
    },
    stopWhen: stepCountIs(2),
    prompt: 'Who is the mayor of Paris? Search, then send the answer.',
  });

  const replayedItem = requests[1].input.find(
    item =>
      item.type === (store ? 'item_reference' : 'web_search_call') &&
      item.id === webSearchCall.id,
  );

  return {
    toolVariant,
    store,
    replayedItem,
    expectedItem:
      expectedAction == null
        ? undefined
        : store
          ? { type: 'item_reference', id: webSearchCall.id }
          : {
              type: 'web_search_call',
              id: webSearchCall.id,
              status: 'completed',
              action: expectedAction,
            },
    input: requests[1].input,
    warnings: result.steps[1].warnings,
  };
}

async function main() {
  const cases = await Promise.all([
    runReplayCase({
      toolVariant: 'web_search',
      responseAction: {
        type: 'search',
        query: 'mayor of Paris',
        sources: [{ type: 'url', url: 'https://www.paris.fr' }],
      },
      expectedAction: {
        type: 'search',
        query: 'mayor of Paris',
        sources: [{ type: 'url', url: 'https://www.paris.fr' }],
      },
    }),
    runReplayCase({
      toolVariant: 'web_search_preview',
      responseAction: {
        type: 'search',
        query: 'mayor of Paris',
      },
      expectedAction: {
        type: 'search',
        query: 'mayor of Paris',
      },
    }),
    runReplayCase({
      toolVariant: 'web_search',
      responseAction: {
        type: 'open_page',
        url: 'https://www.paris.fr',
      },
      expectedAction: {
        type: 'open_page',
        url: 'https://www.paris.fr',
      },
    }),
    runReplayCase({
      toolVariant: 'web_search',
      responseAction: {
        type: 'find_in_page',
        url: 'https://www.paris.fr',
        pattern: 'mayor',
      },
      expectedAction: {
        type: 'find_in_page',
        url: 'https://www.paris.fr',
        pattern: 'mayor',
      },
    }),
    runReplayCase({
      toolVariant: 'web_search',
      store: true,
      responseAction: {
        type: 'search',
        query: 'mayor of Paris',
        sources: [{ type: 'url', url: 'https://www.paris.fr' }],
      },
      expectedAction: {
        type: 'search',
        query: 'mayor of Paris',
        sources: [{ type: 'url', url: 'https://www.paris.fr' }],
      },
    }),
  ]);

  const hasExpectedItem = (testCase: (typeof cases)[number]) =>
    JSON.stringify(testCase.replayedItem) ===
    JSON.stringify(testCase.expectedItem);

  const statelessFailures = cases.filter(
    testCase => !testCase.store && !hasExpectedItem(testCase),
  );
  const comparisonFailures = cases.filter(
    testCase => testCase.store && !hasExpectedItem(testCase),
  );

  if (comparisonFailures.length > 0) {
    throw new Error(
      `store:true comparison did not return the expected item_reference: ${JSON.stringify(
        comparisonFailures,
      )}`,
    );
  }

  for (const testCase of cases) {
    console.log(
      JSON.stringify(
        {
          toolVariant: testCase.toolVariant,
          store: testCase.store,
          expectedItem: testCase.expectedItem,
          replayedItem: testCase.replayedItem,
          secondRequestInput: testCase.input,
          warnings: testCase.warnings,
        },
        null,
        2,
      ),
    );
  }

  if (statelessFailures.length > 0) {
    console.error(
      'ISSUE_22343_REPRODUCED: store:false dropped replayable web_search_call items from the next Responses API request',
    );
    process.exit(1);
  }

  console.log(
    'ISSUE_22343_FIXED: all replayable web_search_call items were preserved',
  );
}

main().catch(error => {
  console.error('ISSUE_22343_HARNESS_ERROR', error);
  process.exit(2);
});
