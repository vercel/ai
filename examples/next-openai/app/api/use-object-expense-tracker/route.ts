import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import { expenseSchema } from './schema';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { expense }: { expense: string } = await req.json();

  const result = await streamObject({
    model: openai('gpt-4-turbo'),
    system:
      'You categorize expenses into one of the following categories: ' +
      'TRAVEL, MEALS, ENTERTAINMENT, OFFICE SUPPLIES, OTHER.' +
      'The current date is: ' +
      new Date()
        .toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        })
        .replace(/(\w+) (\d+), (\d+)/, '$3-$1-$2') +
      '. When no date is supplied, use the current date.',
    prompt: `Please categorize the following expense: "${expense}"`,
    schema: expenseSchema,
    onFinish({ object }) {
      // save object to database
    },
  });

  return result.toTextStreamResponse();
}
