import { siliconflow } from '@ai-sdk/siliconflow';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text } = await generateText({
    model: siliconflow('Qwen/Qwen3-32B'),
    prompt: 'Write a JavaScript function that sorts a list:',
  });

  console.log(text);
});
