import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import fs from 'node:fs';

async function main() {
  const openai = createOpenAICompatible({
    apiKeyEnvVarName: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    name: 'openai',
  });
  const model = openai.chatModel('gpt-4o-mini');
  const result = await generateText({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          { type: 'image', image: fs.readFileSync('./data/comic-cat.png') },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
