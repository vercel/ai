import { createLuma } from '@ai-sdk/luma';
import { run } from '../lib/run';

run(async () => {
  let generationId = '';
  const provider = createLuma({
    apiKey: 'test-key',
    baseURL: 'https://example.com',
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      console.log('Requested path:', url.pathname);
      if (url.pathname === '/image.png') {
        return new Response(new Uint8Array([1, 2, 3]));
      }
      return Response.json({
        id: generationId,
        generation_type: 'image',
        state: init?.method === 'POST' ? 'queued' : 'completed',
        created_at: '2024-01-01T00:00:00Z',
        model: 'photon-1',
        request: {
          generation_type: 'image',
          model: 'photon-1',
          prompt: 'A tree',
        },
        assets: { image: 'https://example.com/image.png' },
      });
    },
  });

  for (const id of ['abc/../../internal', '.', '..']) {
    generationId = id;
    console.log('Generation ID:', id);
    await provider.image('photon-1').doGenerate({
      prompt: 'A tree',
      n: 1,
      size: undefined,
      aspectRatio: '1:1',
      seed: undefined,
      providerOptions: {},
      files: undefined,
      mask: undefined,
    });
  }
});
