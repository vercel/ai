import { generateText } from 'ai';

declare const model: any;
declare const weather: any;

await generateText({
  model,
  tools: { weather },
  experimental_activeTools: ['weather'],
});
