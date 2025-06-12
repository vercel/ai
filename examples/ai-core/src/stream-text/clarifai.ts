import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

async function main() {
  const clarifai = createOpenAICompatible({
    baseURL: 'https://api.clarifai.com/v2/ext/openai/v1',
    apiKey: process.env.CLARIFAI_PAT,
  });

  const model = clarifai.chatModel(
    'https://clarifai.com/deepseek-ai/deepseek-chat/models/DeepSeek-R1-0528-Qwen3-8B',
  );

  const result = streamText({
    model,
    prompt: 'What is photosynthesis?',
  });

  for await (const message of result.textStream) {
    console.log(message);
  }
}

main().catch(console.error);