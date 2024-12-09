import {
  GoogleVertexAnthropicMessagesModelId,
  GoogleVertexAnthropicMessagesSettings,
} from './google-vertex-anthropic-messages-settings';

describe('GoogleVertexAnthropicMessagesSettings', () => {
  it('should allow valid explicit model ID', () => {
    const modelId: GoogleVertexAnthropicMessagesModelId =
      'claude-3-5-haiku@20241022';
    expect(modelId).toBeDefined();
  });

  it('should allow custom model IDs as strings', () => {
    const modelId: GoogleVertexAnthropicMessagesModelId = 'my-random-model-id';
    expect(modelId).toBeDefined();
  });

  it('should allow empty settings object', () => {
    const settings: GoogleVertexAnthropicMessagesSettings = {};
    expect(settings).toBeDefined();
  });
});
