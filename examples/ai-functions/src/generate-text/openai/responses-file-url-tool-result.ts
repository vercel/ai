import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const readPDFDocument = tool({
    description: `Read and return a PDF document by URL`,
    inputSchema: z.object({}),
    execute: async () => ({
      success: true,
      description: 'Successfully loaded PDF document',
      pdfUrl: 'https://www.berkshirehathaway.com/letters/2024ltr.pdf',
    }),
    toModelOutput({ output }) {
      return {
        type: 'content',
        value: [
          {
            type: 'text',
            text: output.description,
          },
          {
            type: 'file-url',
            url: output.pdfUrl,
          },
        ],
      };
    },
  });

  const result = await generateText({
    model: openai.responses('gpt-4.1-mini'),
    prompt:
      'Please read the PDF document using the tool provided and return a summary of it.',
    tools: {
      readPDFDocument,
    },
    stopWhen: stepCountIs(4),
  });

  console.log(`Assistant response: ${JSON.stringify(result.text, null, 2)}`);
  console.log(`Warnings: ${JSON.stringify(result.warnings, null, 2)}`);
});
