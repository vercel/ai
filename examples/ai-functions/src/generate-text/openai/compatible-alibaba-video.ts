import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

const alibaba = createOpenAICompatible({
  name: 'alibaba',
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.ALIBABA_API_KEY,
});

run(async () => {
  const { text } = await generateText({
    model: alibaba('qwen3-vl-plus'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the main action in this video.' },
          {
            type: 'file',
            mediaType: 'video/mp4',
            data: fs.readFileSync('./data/prudence.mp4'),
          },
        ],
      },
    ],
  });

  console.log(text);
});
