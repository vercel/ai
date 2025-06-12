import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const clarifai = createOpenAICompatible({
    baseURL: 'https://api.clarifai.com/v2/ext/openai/v1',
    apiKey: process.env.CLARIFAI_PAT,
  });

  const model = clarifai.chatModel(
    'https://clarifai.com/deepseek-ai/deepseek-chat/models/DeepSeek-R1-0528-Qwen3-8B',
  );

  const { text, usage, finishReason } = await generateText({
    model,
    prompt: 'What is photosynthesis?',
  });

  console.log(text);
  console.log('Token usage:', usage);
  console.log('Finish reason:', finishReason);
}

main().catch(console.error);
