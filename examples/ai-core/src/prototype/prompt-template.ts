import { createPromptTemplate, generateText } from 'ai';
import dotenv from 'dotenv';
import { registry } from '../registry/setup-registry';

dotenv.config();

// could also be loaded from an external source (edge config)
const translate = createPromptTemplate(
  async ({
    sentence,
    language,
  }: {
    sentence: string;
    language: 'French' | 'Spanish' | 'German';
  }) => ({
    system: `You are a translator who translates from "English" to "${language}".`,
    prompt: `Translate the following sentence:\n\n"${sentence}"`,
  }),
);

async function main() {
  const result = await generateText({
    model: registry.languageModel('openai:gpt-4-turbo'),
    promptTemplate: translate({
      sentence: 'Hello, how are you?',
      language: 'French',
    }),
  });

  console.log(result.text);
}

main().catch(console.error);
