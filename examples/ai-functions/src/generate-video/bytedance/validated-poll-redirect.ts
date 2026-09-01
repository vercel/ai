import { createByteDance } from '@ai-sdk/bytedance';
import { DownloadError, experimental_generateVideo as generateVideo } from 'ai';
import { run } from '../../lib/run';

const baseURL = 'http://localhost:3000/api/v3';

const byteDance = createByteDance({
  apiKey: 'example-key',
  baseURL,
  fetch: async (input, init) => {
    const url = input.toString();

    if (init?.method === 'POST') {
      return Response.json({ id: 'example-task' });
    }

    console.log('Status poll redirect mode:', init?.redirect);

    return new Response(null, {
      status: 302,
      headers: {
        Location: 'http://169.254.169.254/latest/meta-data/',
      },
    });
  },
});

run(async () => {
  try {
    await generateVideo({
      model: byteDance.video('seedance-1-0-pro-250528'),
      prompt: 'A paper airplane gliding over a miniature city.',
      maxRetries: 0,
      poll: { intervalMs: 0 },
    });
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      console.log('Blocked unsafe polling redirect:', error.message);
      return;
    }

    throw error;
  }
});
