import { describe, it, expect, vi } from 'vitest';
import { createReplicate } from './replicate-provider';
import { ReplicateImageModel } from './replicate-image-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./replicate-image-model', () => ({
  ReplicateImageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include replicate version in user-agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          status: 'succeeded',
          output: ['https://example.com/image.jpg'],
        }),
      ),
    );

    const provider = createReplicate({
      apiToken: 'test-api-token',
      fetch: mockFetch,
    });

    const model = provider.image(
      'stability-ai/stable-diffusion:27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478',
    );

    const constructorCall = vi.mocked(ReplicateImageModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers;

    expect((headers as Record<string, string>)['user-agent']).toContain(
      'ai-sdk/replicate/0.0.0-test',
    );
  });
});
