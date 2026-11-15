import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createAmazonBedrock } from './amazon-bedrock-provider';
import { createAmazonBedrockAnthropic } from './anthropic/amazon-bedrock-anthropic-provider';
import { createBedrockMantle } from './mantle/bedrock-mantle-provider';

beforeEach(() => {
  vi.stubEnv('AWS_ENDPOINT_URL', undefined);
  vi.stubEnv('AWS_ENDPOINT_URL_BEDROCK_RUNTIME', undefined);
  vi.stubEnv('AWS_ENDPOINT_URL_BEDROCK_AGENT_RUNTIME', undefined);
});
afterEach(() => vi.unstubAllEnvs());

for (const [name, create] of [
  ['runtime', createAmazonBedrock],
  ['anthropic', createAmazonBedrockAnthropic],
  ['mantle', createBedrockMantle],
] as const) {
  describe(`${name} region validation`, () => {
    it.each([
      'evil.example.com/#',
      'user@internal:8080/#',
      'us-east-1/../..',
      'us east 1',
      '',
      'region\n',
    ])('rejects %j before fetching', async region => {
      const fetch = vi.fn();
      await expect(
        Promise.resolve().then(() =>
          create({ region, apiKey: 'test-key', fetch })(
            'test-model',
          ).doGenerate({
            prompt: [
              { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
            ],
          }),
        ),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        argument: 'region',
      });
      expect(fetch).not.toHaveBeenCalled();
    });
    it('uses the environment region', async () => {
      vi.stubEnv('AWS_REGION', 'user@internal/#');
      const fetch = vi.fn();
      await expect(
        Promise.resolve().then(() =>
          create({ apiKey: 'test-key', fetch })('test-model').doGenerate({
            prompt: [],
          }),
        ),
      ).rejects.toMatchObject({ argument: 'region' });
      expect(fetch).not.toHaveBeenCalled();
    });
    it.each(['us-east-1', 'not a region'])(
      'sends to a custom endpoint regardless of unused region %j',
      async region => {
        const fetch = vi.fn(async (_url: RequestInfo | URL) => {
          throw new Error('captured');
        });
        await expect(
          create({
            region,
            apiKey: 'test-key',
            baseURL: 'https://proxy.example/v1',
            fetch,
          })('test-model').doGenerate({ prompt: [] }),
        ).rejects.toThrow('captured');
        expect(String(fetch.mock.calls[0]?.[0])).toContain(
          'https://proxy.example/v1',
        );
      },
    );
  });
}
