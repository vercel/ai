import { google } from '@ai-sdk/google';
import { generateObject } from '@ai-sdk/ai';
import { z } from 'zod';

const model = google('gemini-2.5-pro');

async function testGenerateObject() {
  try {
    const { object } = await generateObject({
      model: model,
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(z.string()),
          steps: z.array(z.string()),
        }),
      }),
      prompt: 'Generate a lasagna recipe.',
    });

    console.log('Success! Generated object:');
    console.log(JSON.stringify(object, null, 2));
  } catch (error) {
    console.error('Error occurred:');
    console.error(error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
    });
  }
}

testGenerateObject();
