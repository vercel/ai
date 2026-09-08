import { googleVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const endpoint = process.env.GOOGLE_VERTEX_EXTERNAL_API_ENDPOINT;
  const apiKey = process.env.GOOGLE_VERTEX_EXTERNAL_API_KEY;

  if (endpoint == null || apiKey == null) {
    throw new Error(
      'GOOGLE_VERTEX_EXTERNAL_API_ENDPOINT and GOOGLE_VERTEX_EXTERNAL_API_KEY must be set',
    );
  }

  const { text, sources } = await generateText({
    model: googleVertex('gemini-2.5-flash'),
    tools: {
      external_api: googleVertex.tools.externalApi({
        apiSpec: 'SIMPLE_SEARCH',
        endpoint,
        authConfig: {
          apiKeyConfig: { apiKeyString: apiKey },
        },
      }),
    },
    prompt: 'What information can you find about our return policy?',
  });

  console.log(text);
  console.log(sources);
});
