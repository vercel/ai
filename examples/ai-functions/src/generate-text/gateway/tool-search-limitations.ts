import { generateText, isStepCount, tool, toolSearch } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

const inbox = [
  {
    id: 'email-1',
    sender: 'Maya',
    subject: 'Launch schedule',
    body: 'The launch moved to Friday. Please approve the release checklist by 3 pm today.',
  },
  {
    id: 'email-2',
    sender: 'Alex',
    subject: 'Lunch plans',
    body: 'Anyone up for pizza next week? No response needed today.',
  },
];

const deferred = (description: string) =>
  tool({
    description,
    inputSchema: z.object({}),
    deferLoading: true,
    execute: async () => [],
  });

const tools = {
  search_tools: toolSearch({ maxResults: 6 }),
  gmail_list_messages: tool({
    description:
      'List recent Gmail messages with sender, subject, and received time.',
    inputSchema: z.object({}),
    deferLoading: true,
    execute: async () =>
      inbox.map(({ id, sender, subject }) => ({ id, sender, subject })),
  }),
  gmail_list_drafts: deferred('List Gmail drafts with subject and recipients.'),
  gmail_list_labels: deferred(
    'List Gmail labels (system and user) with ids for filtering and modify_message.',
  ),
  gmail_list_threads: deferred(
    'List Gmail conversation threads with snippet and message count.',
  ),
  linear_list_teams: deferred(
    'List the teams in the Linear workspace with their ids and keys.',
  ),
  gmail_get_message: tool({
    description:
      'Read one Gmail message including its body, recipients, and inbound attachment metadata.',
    inputSchema: z.object({ messageId: z.string() }),
    deferLoading: true,
    execute: async ({ messageId }) =>
      inbox.find(message => message.id === messageId) ?? {
        error: 'Message not found.',
      },
  }),
};

run(async () => {
  const model = 'google/gemini-3.7-flash';
  console.log(`\n=== Live tool search (${model}) ===`);
  let modelCall = 0;
  const startedAt = performance.now();

  const result = await generateText({
    model,
    tools,
    prompt:
      'Read today\'s emails and summarize the important ones. Read the message bodies before deciding what is important. Start by calling search_tools with the query "gmail list messages".',
    stopWhen: isStepCount(8),
    onLanguageModelCallStart: ({ tools: definitions }) => {
      modelCall++;
      const names = definitions?.map(tool => tool.name) ?? [];
      console.log(`\nModel call ${modelCall}; available tools:`, names);
      console.log(
        'Can read email bodies:',
        names.includes('gmail_get_message'),
      );
    },
    onLanguageModelCallEnd: ({ performance, usage }) => {
      console.log('Model response:', {
        durationMs: Math.round(performance.responseTimeMs),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    },
    onStepEnd: ({ toolCalls, toolResults }) => {
      console.dir(
        {
          toolCalls: toolCalls.map(({ toolName, input }) => ({
            toolName,
            input,
          })),
          toolResults: toolResults.map(({ toolName, output }) => ({
            toolName,
            output,
          })),
        },
        { depth: null },
      );
    },
  });

  const searchCalls = result.steps.flatMap(step =>
    step.toolCalls.filter(call => call.toolName === 'search_tools'),
  );
  console.log('\nSearch calls:', searchCalls.length);
  console.log('Model calls:', modelCall);
  console.log('Elapsed (ms):', Math.round(performance.now() - startedAt));
  console.log('Total token usage:', result.totalUsage);
  console.log('Final answer:', result.text);
});
