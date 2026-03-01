import { google } from '@ai-sdk/google';
import { generateText, stepCountIs, tool } from 'ai';
import { run } from '../lib/run';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';

run(async () => {
  const readPDFDocument = tool({
    description: `Read and return a PDF document`,
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const pdfPath = path.join(__dirname, '../../data/ai.pdf');
        const pdfData = await fs.readFile(pdfPath);

        const base64Data = pdfData.toString('base64');

        console.log(`PDF document read successfully`);

        return {
          success: true,
          description: 'Successfully loaded PDF document',
          pdfData: base64Data,
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
            type: 'file-data',
            data: result.pdfData,
            mediaType: 'application/pdf',
            filename: 'ai.pdf',
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
