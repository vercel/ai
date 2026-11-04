import { generateText, isStepCount, tool, toolSearch } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

const deferred = (description: string) =>
  tool({
    description,
    deferLoading: true,
    inputSchema: z.object({}),
    execute: async () => [],
  });

run(async () => {
  const result = await generateText({
    model: 'google/gemini-3.7-flash',
    tools: {
      search_tools: toolSearch({
        search: ({ query, tools }) => {
          const preferred = /\bgmail\b/i.test(query)
            ? ['gmail_list_messages', 'gmail_get_message']
            : [];
          return preferred.filter(name =>
            tools.some(tool => tool.name === name),
          );
        },
      }),
      gmail_list_messages: tool({
        description: 'List recent Gmail messages.',
        deferLoading: true,
        inputSchema: z.object({}),
        execute: async () => [{ id: 'email-1', subject: 'Launch schedule' }],
      }),
      gmail_list_drafts: deferred('List Gmail drafts.'),
      gmail_list_labels: deferred('List Gmail labels.'),
      gmail_list_threads: deferred('List Gmail threads.'),
      linear_list_teams: deferred('List Linear teams.'),
      gmail_get_message: tool({
        description: 'Read one Gmail message including its body.',
        deferLoading: true,
        inputSchema: z.object({ messageId: z.string() }),
        execute: async ({ messageId }) => ({
          id: messageId,
          body: 'The launch moved to Friday. Approve the checklist by 3 pm today.',
        }),
      }),
    },
    prompt:
      'Read today\'s Gmail messages and summarize their bodies. Start by searching for "gmail list messages".',
    stopWhen: isStepCount(5),
    onStepEnd: ({ stepNumber, toolCalls, toolResults }) => {
      console.log(`\nStep ${stepNumber + 1}`);
      console.dir(
        {
          calls: toolCalls.map(({ toolName, input }) => ({ toolName, input })),
          results: toolResults.map(({ toolName, output }) => ({
            toolName,
            output,
          })),
        },
        { depth: null },
      );
    },
  });

  console.log(
    '\nSearch calls:',
    result.steps
      .flatMap(step => step.toolCalls)
      .filter(call => call.toolName === 'search_tools').length,
  );
  console.log(result.text);
});
