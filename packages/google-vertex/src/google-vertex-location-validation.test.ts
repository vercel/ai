import { describe, expect, it, afterEach, vi } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider-base';
import { createGoogleVertexAnthropic } from './anthropic/google-vertex-anthropic-provider';
import { createGoogleVertexMaas } from './maas/google-vertex-maas-provider';

afterEach(() => vi.unstubAllEnvs());

for (const [name, create] of [
  ['google', createGoogleVertex],
  ['anthropic', createGoogleVertexAnthropic],
  ['maas', createGoogleVertexMaas],
] as const) {
  describe(`${name} location validation`, () => {
    it.each([
      'evil.example.com/#',
      'user@internal:8080/#',
      'us-east-1/../..',
      'us east 1',
      '',
      'region\n',
    ])('rejects %j before fetching', location => {
      const fetch = vi.fn();
      expect(() =>
        create({ project: 'test', location, fetch })('test-model'),
      ).toThrow(
        expect.objectContaining({
          name: 'AI_InvalidArgumentError',
          argument: 'location',
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    });
    it.each(['global', 'eu', 'us', 'us-central1', 'us-east5'])(
      'accepts %j',
      location => {
        expect(() =>
          create({ project: 'test', location })('test-model'),
        ).not.toThrow();
      },
    );
    it('uses the environment location', () => {
      vi.stubEnv('GOOGLE_VERTEX_LOCATION', 'user@internal/#');
      expect(() => create({ project: 'test' })('test-model')).toThrow(
        expect.objectContaining({ argument: 'location' }),
      );
    });
    it('allows a custom URL with an unused invalid location', () => {
      expect(() =>
        create({
          project: 'test',
          location: 'not a region',
          baseURL: 'https://proxy.example/v1',
        })('test-model'),
      ).not.toThrow();
    });
    it('allows a custom URL without a location', () => {
      vi.stubEnv('GOOGLE_VERTEX_LOCATION', undefined);
      expect(() =>
        create({ baseURL: 'https://proxy.example/v1' })('test-model'),
      ).not.toThrow();
    });
  });
}
it('does not validate location in express mode', () => {
  expect(() =>
    createGoogleVertex({ apiKey: 'test-key', location: 'not a region' })(
      'test-model',
    ),
  ).not.toThrow();
});
it.each(['chirp_3', 'gemini-3.5-transcribe-live'])(
  'validates location for the separate transcription host of %s',
  model => {
    expect(() =>
      createGoogleVertex({
        project: 'test',
        location: 'user@internal/#',
        baseURL: 'https://proxy.example/v1',
      }).transcription(model),
    ).toThrow(expect.objectContaining({ argument: 'location' }));
  },
);
