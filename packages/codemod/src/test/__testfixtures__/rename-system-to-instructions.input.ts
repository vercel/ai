import { generateText } from 'ai';

declare const model: any;

await generateText({
  model,
  system: 'hello',
  prompt: 'Hello',
  onStart: ({ system }) => system,
});
