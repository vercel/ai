import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { run } from '../lib/run';

// Reproduces #24318 without credentials or a live provider request.
run(async () => {
  for (const code of [503, null]) {
    const google = createGoogleGenerativeAI({
      apiKey: 'test-key',
      fetch: async () =>
        new Response(
          `data: ${JSON.stringify({
            error: {
              code,
              message: 'The model is overloaded.',
              status: 'UNAVAILABLE',
            },
          })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    });

    const { stream } = await google('gemini-4-argon').doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });

    console.log('Error code:', code);
    for await (const part of stream) {
      console.log(part);
    }
  }
});
