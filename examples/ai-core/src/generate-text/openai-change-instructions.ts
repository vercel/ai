import { openai } from '@ai-sdk/openai';
import {
  CoreMessage,
  experimental_updateInstructionToolResult,
  generateText,
  tool,
} from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { z } from 'zod';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const escalateToHuman = tool({
  description: 'Escalate to a human agent.',
  parameters: z.object({}),
});

const lookupItem = tool({
  description:
    'Use to find item ID. Search query can be a description or keywords.',
  parameters: z.object({
    searchQuery: z.string(),
  }),
  execute: async ({ searchQuery }) => {
    console.log('Searching for item:', searchQuery);
    const itemId = 'item_132612938';
    console.log('Found item:', itemId);
    return itemId;
  },
});

const executeRefund = tool({
  description: 'Execute a refund for a given item ID and reason.',
  parameters: z.object({
    itemId: z.string(),
    reason: z.string().optional(),
  }),
  execute: async ({ itemId, reason = 'not provided' }) => {
    console.log('\n\n=== Refund Summary ===');
    console.log(`Item ID: ${itemId}`);
    console.log(`Reason: ${reason}`);
    console.log('=================\n');
    console.log('Refund execution successful!');
    return 'success';
  },
});

const executeOrder = tool({
  description: 'Execute an order for a given product and price.',
  parameters: z.object({
    product: z.string(),
    price: z.number().int().positive(),
  }),
  execute: async ({ product, price }) => {
    console.log('\n\n=== Order Summary ===');
    console.log(`Product: ${product}`);
    console.log(`Price: $${price}`);
    console.log('=================\n');

    const confirm = await terminal.question('Confirm order? y/n: ');

    if (confirm.trim().toLowerCase() === 'y') {
      console.log('Order execution successful!');
      return 'Success';
    } else {
      console.log('Order cancelled!');
      return 'User cancelled order.';
    }
  },
});

const triageSystemPrompt =
  'You are a customer service bot for ACME Inc. ' +
  'Introduce yourself. Always be very brief. ' +
  'Gather information to direct the customer to the right department by calling the appropriate tool. ' +
  'But make your questions subtle and natural.';

const triageTools = [
  'transferToSales' as const,
  'transferToIssuesAndRepairs' as const,
  'escalateToHuman' as const,
];

async function main() {
  const messages: CoreMessage[] = [];

  while (true) {
    const userInput = await terminal.question('You: ');
    messages.push({ role: 'user', content: userInput });

    const result = await generateText({
      model: openai('gpt-4o-2024-08-06', { structuredOutputs: true }),
      maxSteps: 20,
      tools: {
        escalateToHuman,
        executeRefund,
        lookupItem,
        executeOrder,

        // you can change instructions using experimental_updateInstructionToolResult:
        transferBackToTriage: tool({
          parameters: z.object({}),
          execute: async () =>
            experimental_updateInstructionToolResult({
              system: triageSystemPrompt,
              activeTools: triageTools,
            }),
        }),
        transferToSales: tool({
          parameters: z.object({}),
          execute: async () => {
            console.log('transferring to sales');
            return experimental_updateInstructionToolResult({
              system:
                'You are a sales representative for ACME Inc.' +
                'Always answer in a sentence or less.' +
                'Follow the following routine with the user:' +
                '1. Ask them about any problems in their life related to catching roadrunners.' +
                '2. Casually mention one of ACMEs crazy made-up products can help.' +
                ' - Do not mention price.' +
                '3. Once the user is bought in, drop a ridiculous price.' +
                '4. Only after everything, and if the user says yes, ' +
                'tell them a crazy caveat and execute their order.',
              activeTools: ['executeOrder', 'transferBackToTriage'],
            });
          },
        }),
        transferToIssuesAndRepairs: tool({
          parameters: z.object({}),
          execute: async () => {
            console.log('transferring to issues and repairs');
            return experimental_updateInstructionToolResult({
              system:
                'You are a customer support agent for ACME Inc.' +
                'Always answer in a sentence or less.' +
                'Follow the following routine with the user:' +
                '1. First, ask probing questions and understand the users problem deeper.' +
                ' - unless the user has already provided a reason.' +
                '2. Propose a fix (make one up).' +
                '3. ONLY if not satisfied, offer a refund.' +
                '4. If accepted, search for the ID and then execute refund.',
              activeTools: [
                'executeRefund',
                'lookUpItem',
                'transferBackToTriage',
              ],
            });
          },
        }),
      },
      messages,
      system: triageSystemPrompt,
      experimental_activeTools: triageTools,
      onStepFinish(event) {
        console.log('event', JSON.stringify(event, null, 2));
      },
    });

    process.stdout.write(`\nAssistant: ${result.text}`);
    process.stdout.write('\n\n');

    messages.push(...result.responseMessages);
  }
}

main().catch(console.error);
