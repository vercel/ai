import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

async function main() {
  const togetherai = createOpenAICompatible({
    apiKeyEnvVarName: 'TOGETHER_AI_API_KEY',
    baseURL: 'https://api.together.xyz/v1',
    name: 'togetherai',
  });
  const model = togetherai.chatModel('meta-llama/Llama-3-70b-chat-hf');
  const result = await generateText({
    model,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
