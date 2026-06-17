import { generateText } from 'ai';

declare const model: any;

await generateText({
  model,
  instructions: 'hello',
  prompt: 'Hello',
  onStart: ({ instructions: system }) => system,
});
