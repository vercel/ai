import { google } from '@ai-sdk/google';
import { generateText, stepCountIs, tool } from 'ai';
import { run } from '../lib/run';
import { z } from 'zod';

run(async () => {
  const readPDFDocument = tool({
    description: `Read and return a PDF document`,
    inputSchema: z.object({}),
    execute: async () => {
      try {
        return {
          success: true,
          description: 'Successfully loaded PDF document',
          pdfUrl:
            'https://github.com/vercel/ai/blob/main/examples/ai-core/data/ai.pdf?raw=true',
        };
      } catch (error) {
        throw new Error(`Failed to analyze PDF: ${error}`);
      }
    },
    toModelOutput(result) {
      return {
        type: 'content',
        value: [
          {
            type: 'text',
            text: result.description,
          },
          {
            type: 'file-url',
            url: result.pdfUrl,
          },
        ],
      };
    },
  });

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt:
      'Please read the pdf document using the tool provided and return the summary of that pdf',
    tools: {
      readPDFDocument,
    },
    stopWhen: stepCountIs(4),
  });

  console.log(`Assistant response: ${JSON.stringify(result.text, null, 2)}`);
});
