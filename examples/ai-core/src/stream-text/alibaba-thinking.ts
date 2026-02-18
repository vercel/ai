import { alibaba, type AlibabaLanguageModelOptions } from '@ai-sdk/alibaba';
import { streamText } from 'ai';
import 'dotenv/config';

let thinkingBudget: number | undefined;
// thinkingBudget = 100; // uncomment this line to run with budget

async function main() {
  const result = streamText({
    model: alibaba('qwen3-max'),
    prompt: 'What is the sum of the first 3 prime numbers?',
    providerOptions: {
      alibaba: {
        enableThinking: true,
        ...(thinkingBudget ? { thinkingBudget } : {}),
      } satisfies AlibabaLanguageModelOptions,
    },
  });

  let inReasoning = false;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'reasoning-start': {
        console.log('\n--- Reasoning Process ---');
        inReasoning = true;
        break;
      }
      case 'reasoning-delta': {
        process.stdout.write(part.text);
        break;
      }
      case 'reasoning-end': {
        console.log('\n--- End Reasoning ---\n');
        inReasoning = false;
        break;
      }
      case 'text-delta': {
        if (!inReasoning) {
          process.stdout.write(part.text);
        }
        break;
      }
    }
  }

  const usage = await result.usage;
  console.log('\n\nFinish reason:', await result.finishReason);
  console.log('Usage:', usage);
  if (thinkingBudget) {
    console.log('Was budget respected?', (usage.reasoningTokens ?? 0) <= thinkingBudget);
  }
}

main().catch(console.error);
