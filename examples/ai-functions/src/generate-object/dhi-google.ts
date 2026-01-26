import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'dhi';
import { dhiSchema } from '@ai-sdk/dhi';
import 'dotenv/config';

async function main() {
  const UserSchema = z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  });

  console.log('Testing dhi schema with Gemini...\n');

  try {
    const result = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: dhiSchema(UserSchema),
      prompt: 'Generate a fictional user with name, age, and email.',
    });

    console.log('Generated object:', result.object);
    console.log('\nValidation successful!');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
