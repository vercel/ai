import { describe, expect, it } from 'vitest';
import { encodeModelId } from './amazon-bedrock-encode-model-id';

describe('encodeModelId', () => {
  it('encodes a standard model id (colon percent-encoded, no slashes)', () => {
    expect(encodeModelId('us.amazon.nova-2-lite-v1:0')).toBe(
      'us.amazon.nova-2-lite-v1%3A0',
    );
  });

  it('leaves a plain model id without special characters unchanged', () => {
    expect(encodeModelId('anthropic.claude-3-haiku-20240307-v1:0')).toBe(
      'anthropic.claude-3-haiku-20240307-v1%3A0',
    );
  });

  it('preserves the slash in an application inference profile ARN', () => {
    expect(
      encodeModelId(
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123xyz',
      ),
    ).toBe(
      'arn%3Aaws%3Abedrock%3Aus-east-1%3A123456789012%3Aapplication-inference-profile/abc123xyz',
    );
  });

  it('encodes each segment of a multi-slash path individually', () => {
    expect(encodeModelId('a b/c:d/e')).toBe('a%20b/c%3Ad/e');
  });
});
