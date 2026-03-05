import { describe, expect, it } from 'vitest';
import { getXaiChatModelCapabilities } from './xai-chat-model-capabilities';

describe('getXaiChatModelCapabilities', () => {
  it('should identify reasoning models', () => {
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
  });

  it('should identify non reasoning models', () => {
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
  });

  it('should not support frequency penalty on reasoning models', () => {
    expect(getXaiChatModelCapabilities('grok-4').supportsFrequencyPenalty).toBe(
      false,
    );
    expect(
      getXaiChatModelCapabilities('grok-3-mini').supportsFrequencyPenalty,
    ).toBe(false);
    expect(
      getXaiChatModelCapabilities('grok-3-fast').supportsFrequencyPenalty,
    ).toBe(true);
    expect(
      getXaiChatModelCapabilities('grok-4-1-fast-non-reasoning')
        .supportsFrequencyPenalty,
    ).toBe(true);
  });

  it('should not support presence penalty on grok-3 and reasoning models', () => {
    expect(getXaiChatModelCapabilities('grok-3').supportsPresencePenalty).toBe(
      false,
    );
    expect(
      getXaiChatModelCapabilities('grok-3-fast').supportsPresencePenalty,
    ).toBe(false);
    expect(
      getXaiChatModelCapabilities('grok-3-latest').supportsPresencePenalty,
    ).toBe(false);
    expect(getXaiChatModelCapabilities('grok-4').supportsPresencePenalty).toBe(
      false,
    );
    expect(
      getXaiChatModelCapabilities('grok-3-mini').supportsPresencePenalty,
    ).toBe(false);
    expect(
      getXaiChatModelCapabilities('grok-4-1-fast-non-reasoning')
        .supportsPresencePenalty,
    ).toBe(true);
    expect(getXaiChatModelCapabilities('grok-2').supportsPresencePenalty).toBe(
      true,
    );
  });

  it('should not support stop sequences on reasoning models', () => {
    expect(getXaiChatModelCapabilities('grok-4').supportsStopSequences).toBe(
      false,
    );
    expect(
      getXaiChatModelCapabilities('grok-3-mini').supportsStopSequences,
    ).toBe(false);
    expect(
      getXaiChatModelCapabilities('grok-3-fast').supportsStopSequences,
    ).toBe(true);
    expect(
      getXaiChatModelCapabilities('grok-4-1-fast-non-reasoning')
        .supportsStopSequences,
    ).toBe(true);
  });
});
