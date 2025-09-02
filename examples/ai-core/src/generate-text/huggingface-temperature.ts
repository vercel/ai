import { huggingface } from '@ai-sdk/huggingface';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  console.log('Low temperature (0.1) - More focused:');
  const lowTemp = await generateText({
    model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
    prompt: 'Write a creative story about a robot learning to paint.',
    temperature: 0.1,
  });
  console.log(lowTemp.text);
  console.log();

  console.log('High temperature (1.5) - More creative:');
  const highTemp = await generateText({
    model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
    prompt: 'Write a creative story about a robot learning to paint.',
    temperature: 1.5,
  });
  console.log(highTemp.text);
  console.log();

  console.log('Usage comparison:');
  console.log('Low temp usage:', lowTemp.usage);
  console.log('High temp usage:', highTemp.usage);
}

main().catch(console.error);
