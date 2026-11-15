import { openai } from '@ai-sdk/openai';
import { generateText, isStepCount, tool } from 'ai';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sequential-tool-calls-'));
  const documentPath = join(directory, 'document.txt');

  async function recordPrice(product: string, price: number) {
    console.log(`${product}: start`);
    const previousDocument = await readFile(documentPath, 'utf8');
    const document = `${previousDocument}${product}: $${price}\n`;
    await writeFile(documentPath, document);
    console.log(`${product}: done`, { previousDocument, document });
    return { product, price, previousDocument, document };
  }

  try {
    await writeFile(documentPath, '');

    const result = await generateText({
      model: openai('gpt-6-astra'),
      providerOptions: { openai: { parallelToolCalls: true } },
      prompt: 'What are the current prices of a notebook and a pen?',
      tools: {
        getNotebookPrice: tool({
          description: 'Look up the notebook price and record the quote.',
          inputSchema: z.object({}),
          execute: async () => recordPrice('notebook', 12),
        }),
        getPenPrice: tool({
          description: 'Look up the pen price and record the quote.',
          inputSchema: z.object({}),
          execute: async () => recordPrice('pen', 3),
        }),
      },
      // Each tool reads and rewrites the same document. The second must read
      // the first tool's completed write.
      toolCallConcurrency: 1, // change this value to observe the different behaviour
      maxRetries: 0,
      prepareStep: ({ stepNumber }) => ({
        toolChoice: stepNumber === 0 ? 'required' : 'auto',
      }),
      stopWhen: isStepCount(2),
    });

    console.log('First step tool calls:', result.steps[0].toolCalls);
    console.log('First step tool results:', result.steps[0].toolResults);

    const { toolCalls, staticToolResults } = result.steps[0];
    if (
      toolCalls.length !== 2 ||
      !toolCalls.some(call => call.toolName === 'getNotebookPrice') ||
      !toolCalls.some(call => call.toolName === 'getPenPrice')
    ) {
      throw new Error(
        'The model did not call both price tools in the first step.',
      );
    }

    if (
      staticToolResults.length !== 2 ||
      staticToolResults[1].output.previousDocument !==
        staticToolResults[0].output.document
    ) {
      throw new Error("The second tool did not read the first tool's update.");
    }

    const document = await readFile(documentPath, 'utf8');
    if (
      !document.includes('notebook: $12\n') ||
      !document.includes('pen: $3\n')
    ) {
      throw new Error('The document is missing a quote.');
    }

    console.log('Final document:\n' + document);
    console.log('STEP CONTENT: ', JSON.stringify(result.content, null, 2));
    console.log('Text:', result.text);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
