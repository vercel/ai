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
      pdfUrl:
        'https://github.com/vercel/ai/blob/main/examples/ai-functions/data/ai.pdf?raw=true',
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
            // Note: OpenAI fetches the URL and determines the file type from
            // the HTTP Content-Type response header, not the file extension.
            // The URL must be served with the correct Content-Type (e.g.
            // "application/pdf"). URLs that return "application/octet-stream"
            // (such as raw GitHub URLs) will be rejected by the API.
            // Use file-data with base64 encoding as an alternative if you
            // cannot guarantee the Content-Type of the URL.
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
