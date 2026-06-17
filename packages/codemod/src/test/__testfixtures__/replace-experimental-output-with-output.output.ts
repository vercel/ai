import { generateText } from 'ai';

declare const model: any;
declare const Output: any;
declare const schema: any;

const result = await generateText({
  model,
  output: Output.object({
    schema,
  }),
  prompt: 'Generate a recipe.',
});

console.log(result.output);
