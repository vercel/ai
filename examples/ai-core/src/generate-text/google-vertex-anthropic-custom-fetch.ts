import 'dotenv/config';
import { createGoogleVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';

const googleVertexAnthropic = createGoogleVertexAnthropic({
  // example fetch wrapper that logs the URL:
  fetch: async (url, options) => {
    console.log(`Fetching ${url}`);
    const result = await fetch(url, options);
    console.log(`Fetched ${url}`);
    console.log();
    return result;
  },
});

async function main() {
  const result = await generateText({
    model: googleVertexAnthropic('claude-3-5-sonnet@20240620'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main().catch(console.error);
