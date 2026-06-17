import { generateText } from 'ai';

declare const model: any;
declare const weather: any;

await generateText({
  model,
  tools: { weather },
  prompt: 'Hello',
  prepareStep: () => ({
    activeTools: ['weather'],
  }),
});
