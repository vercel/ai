import { describe, it, expect, vi } from 'vitest';
import { createLuma } from './luma-provider';
import { LumaImageModel } from './luma-image-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./luma-image-model', () => ({
  LumaImageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include luma version in user-agent header for image model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          status: 'completed',
          output: ['https://example.com/image.jpg'],
        }),
      ),
    );

    const provider = createLuma({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.image('dream-machine');

    const constructorCall = vi.mocked(LumaImageModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/luma/0.0.0-test');
  });
});
