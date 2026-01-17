import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { GoogleAuth } from 'google-auth-library';
import { run } from '../lib/run';

async function getVertexAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token?.token) {
    throw new Error('Could not obtain Vertex AI access token');
  }
  return token.token;
}

run(async () => {
  const project = process.env.GOOGLE_VERTEX_PROJECT!;
  const location = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
  const accessToken = await getVertexAccessToken();

  const baseURL = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi`;

  const vertexOpenAI = createOpenAICompatible({
    name: 'vertex',
    baseURL,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const result1 = await generateText({
    model: vertexOpenAI('google/gemini-2.0-flash'),
    prompt: 'What is 2 + 2?',
  });
  console.log(result1.text);

  try {
    const result2 = await generateText({
      model: vertexOpenAI('google/gemini-2.0-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Explain AI SDK middleware to me' },
            {
              type: 'file',
              data: new URL(
                'https://ai-sdk.dev/docs/ai-sdk-core/middleware.md',
              ),
              mediaType: 'text/markdown',
            },
          ],
        },
      ],
    });
    console.log(result2.text);
  } catch (error) {
    console.error('Error:', error);
  }
});
