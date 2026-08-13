import { createOpenResponses } from '@ai-sdk/open-responses';
import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const FAILURE_SIGNAL =
  'ISSUE #18871 REPRODUCED: provider-defined tools were dropped without unsupported warnings';

async function main() {
  let requestBody: Record<string, unknown> | undefined;

  const model = createOpenResponses({
    name: 'openai',
    url: 'https://example.test/v1/responses',
    fetch: async (_input, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error(
          'Reproduction setup failed: request body was not JSON.',
        );
      }

      requestBody = JSON.parse(init.body) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          id: 'resp_issue_18871',
          object: 'response',
          created_at: 1_786_646_400,
          status: 'completed',
          model: 'test-model',
          output: [
            {
              id: 'msg_issue_18871',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: 'ok',
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  })('test-model');

  const result = await generateText({
    model,
    prompt: 'Use the available tools.',
    tools: {
      weather: tool({
        description: 'Get the weather.',
        inputSchema: z.object({ location: z.string() }),
      }),
      web_search: openai.tools.webSearch({}),
      file_search: openai.tools.fileSearch({
        vectorStoreIds: ['vs_issue_18871'],
      }),
    },
  });

  const sentTools = Array.isArray(requestBody?.tools) ? requestBody.tools : [];
  const sentFunctionTools = sentTools.filter(
    sentTool =>
      typeof sentTool === 'object' &&
      sentTool != null &&
      'type' in sentTool &&
      sentTool.type === 'function',
  );
  const sentProviderTools = sentTools.length - sentFunctionTools.length;
  const unsupportedWarnings =
    result.warnings?.filter(warning => warning.type === 'unsupported') ?? [];
  const suppliedProviderTools = 2;
  const silentlyDroppedProviderTools =
    suppliedProviderTools - sentProviderTools - unsupportedWarnings.length;

  if (sentFunctionTools.length !== 1) {
    throw new Error(
      `Reproduction setup failed: expected one function tool in the request, received ${sentFunctionTools.length}.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        sentToolTypes: sentTools.map(sentTool =>
          typeof sentTool === 'object' && sentTool != null && 'type' in sentTool
            ? sentTool.type
            : undefined,
        ),
        warnings: result.warnings ?? [],
      },
      null,
      2,
    ),
  );

  if (silentlyDroppedProviderTools > 0) {
    throw new Error(FAILURE_SIGNAL);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
