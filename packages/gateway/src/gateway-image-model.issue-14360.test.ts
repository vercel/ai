import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const recordedResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/issue-14360-gpt-image-1-inpainting-response.json',
    'utf8',
  ),
) as {
  request: {
    hasFiles: boolean;
    hasMask: boolean;
    modelId: string;
  };
  response: {
    status: number;
  };
};

const recordedAnalysis = JSON.parse(
  fs.readFileSync('src/__fixtures__/issue-14360-analysis.json', 'utf8'),
) as {
  metrics: {
    editMeanAbsoluteDifference: number;
    preservedMeanAbsoluteDifference: number;
    substantiallyChangedPreservedRatio: number;
  };
};

describe('issue #14360', () => {
  it('preserves the pixels outside the transparent inpainting mask', () => {
    expect(recordedResponse.request).toMatchObject({
      hasFiles: true,
      hasMask: true,
      modelId: 'openai/gpt-image-1',
    });
    expect(recordedResponse.response.status).toBe(200);

    expect(
      recordedAnalysis.metrics.preservedMeanAbsoluteDifference,
    ).toBeLessThan(15);
    expect(
      recordedAnalysis.metrics.substantiallyChangedPreservedRatio,
    ).toBeLessThan(0.25);
    expect(recordedAnalysis.metrics.editMeanAbsoluteDifference).toBeGreaterThan(
      recordedAnalysis.metrics.preservedMeanAbsoluteDifference * 1.5,
    );
  });
});
