import { mistral } from '@ai-sdk/mistral';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const model = mistral.embedding('mistral-embed');

  const x = await model.doEmbed({
    values: ['Hello, world!'],
  });

  console.log(x);

  // const result = await generateObject({
  //   model: mistral('open-mistral-7b'),
  //   schema: z.object({
  //     recipe: z.object({
  //       name: z.string(),
  //       ingredients: z.array(
  //         z.object({
  //           name: z.string(),
  //           amount: z.string(),
  //         }),
  //       ),
  //       steps: z.array(z.string()),
  //     }),
  //   }),
  //   prompt: 'Generate a lasagna recipe.',
  // });

  // console.log(JSON.stringify(result.object.recipe, null, 2));
  // console.log();
  // console.log('Token usage:', result.usage);
  // console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
