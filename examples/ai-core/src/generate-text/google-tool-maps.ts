import { google, GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, sources, providerMetadata } = await generateText({
    model: google('gemini-2.5-flash'),
    tools: {
      google_maps: google.tools.googleMaps({}),
    },
    providerOptions: {
      google: {
        retrievalConfig: {
          latLng: { latitude: 34.09, longitude: -117.88 },
        },
      },
    },
    prompt:
      'What are the best Italian restaurants within a 15-minute walk from here?',
  });

  const metadata = providerMetadata?.google as
    | GoogleGenerativeAIProviderMetadata
    | undefined;
  const groundingMetadata = metadata?.groundingMetadata;

  console.log('Generated Text:', text);
  console.dir({ sources }, { depth: null });
  console.dir({ groundingMetadata }, { depth: null });
}

main().catch(console.error);
