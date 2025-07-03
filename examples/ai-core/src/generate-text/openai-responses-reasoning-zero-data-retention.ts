import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText, UserModelMessage } from 'ai';
import 'dotenv/config';

async function main() {
  const query1 = {
    role: 'user',
    content:
      'Analyze the following encrypted data: U2VjcmV0UGFzc3dvcmQxMjM=. What type of encryption is this and what secret does it contain?',
  } satisfies UserModelMessage;
  const result1 = await generateText({
    model: openai.responses('o3-mini'),
    prompt: [query1],
    providerOptions: {
      openai: {
        store: false, // No data retention - makes interaction stateless
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
        include: ['reasoning.encrypted_content'], // Hence, we need to retrieve the model's encrypted reasoning to be able to pass it to follow-up requests
      } satisfies OpenAIResponsesProviderOptions,
    },
  });
  console.log('=== First request ===');
  process.stdout.write('\x1b[34m');
  console.log(JSON.stringify(result1.reasoning, null, 2));
  process.stdout.write('\x1b[0m');
  console.log(result1.text);
  console.log();
  console.log('Finish reason:', result1.finishReason);
  console.log('Usage:', result1.usage);
  console.log();
  console.log('Request:', JSON.stringify(result1.request, null, 2));
  console.log('Response:', JSON.stringify(result1.response, null, 2));

  const query2 = {
    role: 'user',
    content:
      'Based on your previous analysis, what security recommendations would you make?',
  } satisfies UserModelMessage;
  const result2 = await generateText({
    model: openai.responses('o3-mini'),
    prompt: [query1, ...result1.response.messages, query2],
    providerOptions: {
      openai: {
        store: false, // No data retention - makes interaction stateless
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
        include: ['reasoning.encrypted_content'], // Hence, we need to retrieve the model's encrypted reasoning to be able to pass it to follow-up requests
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log('=== Second request ===');
  process.stdout.write('\x1b[34m');
  console.log(JSON.stringify(result2.reasoning, null, 2));
  process.stdout.write('\x1b[0m');
  console.log(result2.text);
  console.log();
  console.log('Finish reason:', result2.finishReason);
  console.log('Usage:', result2.usage);
  console.log();
  console.log('Request:', JSON.stringify(result2.request, null, 2));
  console.log('Response:', JSON.stringify(result2.response, null, 2));
}

main().catch(console.error);
