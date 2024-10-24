import { GoogleAIFileManager } from '@google/generative-ai/server';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import path from 'path';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const fileManager = new GoogleAIFileManager(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
  );

  const filePath = path.resolve(__dirname, '../../data/ai.pdf');

  const geminiFile = await fileManager.uploadFile(filePath, {
    name: `ai-${Math.random().toString(36).substring(7)}`,
    mimeType: 'application/pdf',
  });

  const { object: summary } = await generateObject({
    model: google('gemini-1.5-pro-latest'),
    schema: z.object({
      title: z.string(),
      keyPoints: z.array(z.string()),
    }),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract title and key points from the PDF.',
          },
          {
            type: 'file',
            data: geminiFile.file.uri,
            mimeType: geminiFile.file.mimeType,
          },
        ],
      },
    ],
  });

  console.log(summary);
}

main().catch(console.error);
