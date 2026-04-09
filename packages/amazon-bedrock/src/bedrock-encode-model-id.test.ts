import { describe, expect, it } from 'vitest';
import { bedrockEncodeModelId } from './bedrock-encode-model-id';

describe('bedrockEncodeModelId', () => {
  it('should encode regular model IDs with encodeURIComponent', () => {
    expect(bedrockEncodeModelId('us.amazon.nova-2-lite-v1:0')).toBe(
      'us.amazon.nova-2-lite-v1%3A0',
    );
  });

  it('should not encode ARN model IDs', () => {
    const arn =
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123xyz';
    expect(bedrockEncodeModelId(arn)).toBe(arn);
  });

  it('should not encode cross-region inference profile ARNs', () => {
    const arn =
      'arn:aws:bedrock:us:123456789012:inference-profile/us.anthropic.claude-3-5-sonnet-20241022-v2:0';
    expect(bedrockEncodeModelId(arn)).toBe(arn);
  });

  it('should encode model IDs that contain colons but are not ARNs', () => {
    expect(bedrockEncodeModelId('anthropic.claude-3:latest')).toBe(
      'anthropic.claude-3%3Alatest',
    );
  });

  it('should handle simple model IDs without special characters', () => {
    expect(bedrockEncodeModelId('amazon.titan-embed-text-v1')).toBe(
      'amazon.titan-embed-text-v1',
    );
  });
});
