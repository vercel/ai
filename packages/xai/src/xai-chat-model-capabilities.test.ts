import { describe, expect, it } from 'vitest';
import { getXaiChatModelCapabilities } from './xai-chat-model-capabilities';

describe('getXaiChatModelCapabilities', () => {
  it('should classify reasoning models', () => {
    expect(
      getXaiChatModelCapabilities('grok-4-1-fast-reasoning').isReasoningModel,
    ).toBe(true);
    expect(
      getXaiChatModelCapabilities('grok-4-fast-reasoning').isReasoningModel,
    ).toBe(true);
    expect(getXaiChatModelCapabilities('grok-4').isReasoningModel).toBe(true);
    expect(getXaiChatModelCapabilities('grok-4-0709').isReasoningModel).toBe(
      true,
    );
    expect(getXaiChatModelCapabilities('grok-4-latest').isReasoningModel).toBe(
      true,
    );
    expect(
      getXaiChatModelCapabilities('grok-3-mini-fast-latest').isReasoningModel,
    ).toBe(true);
    expect(
      getXaiChatModelCapabilities('grok-code-fast-1').isReasoningModel,
    ).toBe(true);
    expect(
      getXaiChatModelCapabilities('grok-3-mini-fast-latest').isGrokThreeModel,
    ).toBe(false);
  });

  it('should classify non reasoning models', () => {
    expect(
      getXaiChatModelCapabilities('grok-4-1-fast-non-reasoning')
        .isReasoningModel,
    ).toBe(false);
    expect(
      getXaiChatModelCapabilities('grok-4-fast-non-reasoning').isReasoningModel,
    ).toBe(false);
    expect(getXaiChatModelCapabilities('grok-3').isReasoningModel).toBe(false);
    expect(getXaiChatModelCapabilities('grok-3-latest').isReasoningModel).toBe(
      false,
    );
    expect(getXaiChatModelCapabilities('grok-3-fast').isReasoningModel).toBe(
      false,
    );
    expect(getXaiChatModelCapabilities('grok-3-fast').isGrokThreeModel).toBe(
      true,
    );
  });

  it('should classify grok-3 models excluding mini variants', () => {
    expect(getXaiChatModelCapabilities('grok-3').isGrokThreeModel).toBe(true);
    expect(getXaiChatModelCapabilities('grok-3-latest').isGrokThreeModel).toBe(
      true,
    );
    expect(getXaiChatModelCapabilities('grok-3-fast').isGrokThreeModel).toBe(
      true,
    );
    expect(
      getXaiChatModelCapabilities('grok-3-fast-latest').isGrokThreeModel,
    ).toBe(true);
    expect(getXaiChatModelCapabilities('grok-3-mini').isGrokThreeModel).toBe(
      false,
    );
    expect(
      getXaiChatModelCapabilities('grok-3-mini-fast').isGrokThreeModel,
    ).toBe(false);
    expect(getXaiChatModelCapabilities('grok-2').isGrokThreeModel).toBe(false);
    expect(getXaiChatModelCapabilities('grok-4').isGrokThreeModel).toBe(false);
  });
});
