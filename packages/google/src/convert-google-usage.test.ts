import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  convertGoogleUsage,
  type GoogleUsageMetadata,
} from './convert-google-usage';

const liveResponse = JSON.parse(
  readFileSync('src/__fixtures__/google-tool-use-usage.json', 'utf8'),
) as { usageMetadata: GoogleUsageMetadata };

describe('convertGoogleUsage', () => {
  it('includes tool-use prompt tokens in input usage', () => {
    expect(convertGoogleUsage(liveResponse.usageMetadata)).toMatchObject({
      inputTokens: {
        total: 144,
        noCache: 144,
      },
      outputTokens: {
        total: 107,
      },
    });
  });
});
