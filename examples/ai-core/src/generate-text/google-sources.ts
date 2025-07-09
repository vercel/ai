import { google, GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, sources, providerMetadata } = await generateText({
    model: google('gemini-2.5-flash'),
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    prompt:
      'List the top 5 San Francisco news from the past week.' +
      'You must include the date of each article.',
  });

  const metadata = providerMetadata?.google as
    | GoogleGenerativeAIProviderMetadata
    | undefined;
  const groundingMetadata = metadata?.groundingMetadata;

  console.log(text);
  console.log();
  console.log('SOURCES');
  console.log(sources);
  console.log();
  console.log('PROVIDER METADATA');
  console.log(groundingMetadata);
}

main().catch(console.error);
