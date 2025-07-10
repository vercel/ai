import { google, GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: google('gemini-2.5-flash'),
    prompt: `Based on the document: https://ai.google.dev/gemini-api/docs/url-context#limitations.
            
    Answer this question: How many links we can consume in one request?.
    Also, provide the latest news about AI SDK V5 Beta.`,
    tools: {
      google_search: google.tools.googleSearch({}),
      url_context: google.tools.urlContext({}),
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'source' && part.sourceType === 'url') {
      console.log('\x1b[36m%s\x1b[0m', 'Source');
      console.log('ID:', part.id);
      console.log('Title:', part.title);
      console.log('URL:', part.url);
      console.log();
    }
  }

  console.log();
  const metadata = (await result.providerMetadata)?.google as
    | GoogleGenerativeAIProviderMetadata
    | undefined;
  const groundingMetadata = metadata?.groundingMetadata;
  const urlContextMetadata = metadata?.urlContextMetadata;
  console.log('Grounding metadata:', groundingMetadata);
  console.log('URL context metadata:', urlContextMetadata);
}

main().catch(console.error);
