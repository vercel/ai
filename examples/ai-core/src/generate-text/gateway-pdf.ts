import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const result = await generateText({
    model: 'google/gemini-2.0-flash',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is an embedding model according to this document?',
          },
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
