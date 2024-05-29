import { openai } from '@ai-sdk/openai';
import { CoreMessage, generateText, tool } from 'ai';
import dotenv from 'dotenv';
import * as mathjs from 'mathjs';
import { z } from 'zod';

dotenv.config();

const problem =
  'A taxi driver earns $9461 per 1-hour work. ' +
  'If he works 12 hours a day and in 1 hour he uses 12-liters petrol with price $134 for 1-liter. ' +
  'How much money does he earn in one day?';

async function main() {
  console.log(`PROBLEM: ${problem}\n`);

  // initialize messages:
  const messages: CoreMessage[] = [{ role: 'user', content: problem }];

  while (true) {
    const { toolResults, responseMessages } = await generateText({
      model: openai('gpt-4-turbo'),
      system:
        'You are solving math problems. ' +
        'Reason step by step. ' +
        'Use the calculator when necessary. ' +
        'The calculator can only do simple additions, subtractions, multiplications, and divisions. ' +
        'When you give the final answer, provide an explanation for how you got it.',
      messages,
      tools: {
        calculate: tool({
          description:
            'A tool for evaluating mathematical expressions. Example expressions: ' +
            "'1.2 * (2 + 4.5)', '12.7 cm to inch', 'sin(45 deg) ^ 2'.",
          parameters: z.object({ expression: z.string() }),
          execute: async ({ expression }) => mathjs.evaluate(expression),
        }),
        answer: tool({
          description: 'A tool for providing the final answer.',
          parameters: z.object({ answer: z.string() }),
          execute: async ({ answer }) => {
            console.log(`ANSWER: ${answer}`);
            process.exit(0);
          },
        }),
      },
      toolChoice: 'required',
    });

    for (const toolResult of toolResults) {
      if (toolResult.toolName === 'calculate') {
        console.log(
          `${toolResult.toolName}: ${toolResult.args.expression} = ${toolResult.result}`,
        );
      }
    }

    messages.push(...responseMessages);
  }
}

main().catch(console.error);
