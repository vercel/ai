import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, sources, providerMetadata } = await generateText({
    model: vertex('gemini-2.5-flash'),
    tools: {
      enterprise_web_search: vertex.tools.enterpriseWebSearch({}),
    },
    prompt: 'What are the latest FDA regulations for clinical trials?',
  });

  const groundingMetadata = providerMetadata?.vertex?.groundingMetadata as
    | { webSearchQueries?: string[] }
    | undefined;

  console.log('Generated Text:', text);
  console.log();
  console.log('SOURCES');
  console.dir({ sources }, { depth: null });
  console.log();
  console.log('PROVIDER METADATA');
  console.dir(providerMetadata, { depth: null });
  console.log();
  console.log('GROUNDING METADATA');
  console.log('Web Search Queries:', groundingMetadata?.webSearchQueries);
}

main().catch(console.error);
