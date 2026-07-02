import { convertToModelMessages } from './packages/ai/src/ui/convert-to-model-messages.ts';
import { generateText, jsonSchema, tool } from './packages/ai/src/index.ts';
import { openai } from './packages/openai/src/index.ts';

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
  const uiMessages = [
    { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Book lunch.' }] },
    { role: 'assistant' as const, parts: [
      { type: 'text' as const, text: 'I need approval.', state: 'done' as const },
      { type: 'tool-scheduleLunch', state: 'approval-requested' as const, toolCallId: 'call_123', input: { time: 'noon' } },
    ]},
    { role: 'user' as const, parts: [{ type: 'text' as const, text: 'Make it 12:30 instead.' }] },
  ];
  const messages = await convertToModelMessages(uiMessages, { ignoreIncompleteToolCalls: true });
  console.log('Model messages sent to provider:');
  console.log(JSON.stringify(messages, null, 2));
  try {
    const result = await generateText({
      model: openai.chat('gpt-4o-mini'),
      messages,
      tools: {
        scheduleLunch: tool({
          description: 'Schedule lunch.',
          inputSchema: jsonSchema({
            type: 'object',
            properties: { time: { type: 'string' } },
            required: ['time'],
            additionalProperties: false,
          }),
        }),
      },
    });
    console.log('Unexpected success:', result.text);
    process.exit(1);
  } catch (error) {
    const anyError = error as any;
    console.error('Provider call failed as observed:');
    console.error(anyError?.message ?? error);
    if (anyError?.cause) console.error('cause:', anyError.cause?.message ?? anyError.cause);
    const haystack = `${anyError?.message ?? ''}\n${anyError?.cause?.message ?? ''}`;
    if (haystack.includes('No tool output found for function call') || haystack.includes('tool') || haystack.includes('function_call')) {
      process.exit(0);
    }
    process.exit(2);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
