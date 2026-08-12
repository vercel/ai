import { NoSuchModelError } from '@ai-sdk/provider';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { createSiftQ } from './siftq-provider';
import { SiftQVideoModel } from './siftq-video-model';

const SiftQVideoModelMock = SiftQVideoModel as unknown as Mock;

vi.mock('./siftq-video-model', () => ({
  SiftQVideoModel: vi.fn().mockImplementation(function (
    this: any,
    config: any,
  ) {
    this.provider = config.provider;
    this.modelId = 'MiniMax-H3';
    this.config = config;
  }),
}));

describe('SiftQProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SIFTQ_API_KEY', 'environment-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates the fixed MiniMax-H3 model with SiftQ defaults', () => {
    const model = createSiftQ().video();

    expect(model).toBeInstanceOf(SiftQVideoModel);
    const [config] = SiftQVideoModelMock.mock.calls[0];
    expect(config.provider).toBe('siftq.video');
    expect(config.baseURL).toBe('https://siftq.com/api/minimax');
    expect(config.headers()).toMatchObject({
      authorization: 'Bearer environment-key',
      'user-agent': expect.stringMatching(/^ai-sdk\/siftq\//),
    });
  });

  it('supports custom settings and normalizes the boundary slash', () => {
    const fetch = vi.fn();
    const provider = createSiftQ({
      apiKey: 'custom-key',
      baseURL: 'http://localhost:8787/proxy/',
      headers: { 'x-project': 'test' },
      fetch,
    });

    provider.videoModel();
    const [config] = SiftQVideoModelMock.mock.calls[0];
    expect(config.baseURL).toBe('http://localhost:8787/proxy');
    expect(config.fetch).toBe(fetch);
    expect(config.headers()).toMatchObject({
      authorization: 'Bearer custom-key',
      'x-project': 'test',
    });
  });

  it('fails when neither an option nor SIFTQ_API_KEY provides credentials', () => {
    delete process.env.SIFTQ_API_KEY;
    const provider = createSiftQ();
    provider.video();
    const [config] = SiftQVideoModelMock.mock.calls[0];

    expect(() => config.headers()).toThrow(/SIFTQ_API_KEY/);
  });

  it.each(['not a url', 'ftp://siftq.com/api/minimax/'])(
    'rejects invalid base URL configuration: %s',
    baseURL => {
      expect(() => createSiftQ({ baseURL })).toThrow(/Invalid SiftQ baseURL/);
    },
  );

  it('rejects unsupported model types', () => {
    const provider = createSiftQ();

    expect(() => provider.languageModel('model')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('model')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('model')).toThrow(NoSuchModelError);
  });
});
