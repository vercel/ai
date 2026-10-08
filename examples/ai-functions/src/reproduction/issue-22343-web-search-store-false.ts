import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

type RequestBody = {
  input: Array<Record<string, unknown>>;
};

type WebSearchVariant = 'web_search' | 'web_search_preview';

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

function containsExpectedWebSearchReplay(input: RequestBody['input']) {
  const replay = input.find(item => item.type === 'web_search_call');
  const action = replay?.action as Record<string, unknown> | undefined;
  const sources = action?.sources as Array<Record<string, unknown>> | undefined;

  return (
    replay?.id === 'ws_1' &&
    replay.status === 'completed' &&
    action?.type === 'search' &&
    action.query === 'mayor of Paris' &&
    sources?.some(
      source => source.type === 'url' && source.url === 'https://www.paris.fr',
    ) === true
  );
}

async function captureSecondRequest(variant: WebSearchVariant) {
  const requests: RequestBody[] = [];
  const openai = createOpenAI({
    apiKey: 'test',
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init?.body as string) as RequestBody);

      return requests.length === 1
        ? respond('resp_1', [
            {
              type: 'web_search_call',
              id: 'ws_1',
              status: 'completed',
              action: {
                type: 'search',
                query: 'mayor of Paris',
                sources: [{ type: 'url', url: 'https://www.paris.fr' }],
              },
            },
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

  await generateText({
    model: openai('gpt-5-mini'),
    providerOptions: { openai: { store: false } },
    tools:
      variant === 'web_search'
        ? {
            web_search: openai.tools.webSearch({}),
            send_message: tool({
              inputSchema: z.object({ text: z.string() }),
              execute: async () => ({ sent: true }),
            }),
          }
        : {
            web_search_preview: openai.tools.webSearchPreview({}),
            send_message: tool({
              inputSchema: z.object({ text: z.string() }),
              execute: async () => ({ sent: true }),
            }),
          },
    stopWhen: stepCountIs(2),
    prompt: 'Who is the mayor of Paris? Search, then send the answer.',
  });

  return requests[1]?.input ?? [];
}

async function main() {
  const missingVariants: WebSearchVariant[] = [];

  for (const variant of [
    'web_search',
    'web_search_preview',
  ] satisfies WebSearchVariant[]) {
    const secondRequestInput = await captureSecondRequest(variant);
    console.log(`${variant} second request input:`);
    console.log(JSON.stringify(secondRequestInput, null, 2));

    if (!containsExpectedWebSearchReplay(secondRequestInput)) {
      missingVariants.push(variant);
    }
  }

  if (missingVariants.length > 0) {
    throw new Error(
      `ISSUE_22343_REPRODUCED: second request does not replay prior web_search_call when store is false (${missingVariants.join(', ')})`,
    );
  }
}

main();
