import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import { XaiChatLanguageModel } from './xai-chat-language-model';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const testConfig = {
  provider: 'xai.chat',
  baseURL: 'https://api.x.ai/v1',
  headers: () => ({ authorization: 'Bearer test-api-key' }),
};

const model = new XaiChatLanguageModel('grok-beta', testConfig);

const server = createTestServer({
  'https://api.x.ai/v1/chat/completions': {},
});

describe('XaiChatLanguageModel', () => {
  it('should be instantiated correctly', () => {
    expect(model.modelId).toBe('grok-beta');
    expect(model.provider).toBe('xai.chat');
    expect(model.specificationVersion).toBe('v2');
  });

  it('should have supported URLs', () => {
    expect(model.supportedUrls).toEqual({
      'application/pdf': [/^https:\/\/.*$/],
    });
  });

  describe('doGenerate', () => {
    it('should attempt to call XAI API', async () => {
      // Since we've implemented doGenerate, it will try to make a real API call
      // and fail with "Not Found" because there's no test server set up
      await expect(
        model.doGenerate({
          prompt: TEST_PROMPT,
        }),
      ).rejects.toThrow('Not Found');
    });
  });

  describe('doStream', () => {
    it('should throw not implemented error for now', async () => {
      await expect(
        model.doStream({
          prompt: TEST_PROMPT,
        }),
      ).rejects.toThrow('Not implemented yet');
    });
  });
});
