import { generateText } from 'ai';
import { createVertex } from '@ai-sdk/google-vertex';
import { generateAuthToken } from '@ai-sdk/google-vertex/auth-google';

export async function GET() {
  const vertex = createVertex({
    headers: async () => ({
      Authorization: `Bearer ${await generateAuthToken()}`,
    }),
  });
  const model = vertex('gemini-1.5-flash');
  const { text } = await generateText({
    model,
    prompt: 'tell me a story',
  });
  return Response.json({ message: text });
}
