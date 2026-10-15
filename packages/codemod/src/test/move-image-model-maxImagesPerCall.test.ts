import { describe, expect, it, vi } from 'vitest';
import transformer from '../codemods/v5/move-image-model-maxImagesPerCall';
import { applyTransform, readFixture, testTransform } from './test-utils';

describe('move-image-model-maxImagesPerCall', () => {
  it('moves literal settings to generateImage options', () => {
    testTransform(transformer, 'move-image-model-maxImagesPerCall');
  });

  it('leaves settings that contain a spread unchanged', () => {
    testTransform(transformer, 'move-image-model-maxImagesPerCall-spread');
  });

  it('reports settings that contain a spread', () => {
    const { content } = readFixture(
      'move-image-model-maxImagesPerCall-spread',
      'input',
    );
    const report = vi.spyOn(console, 'log').mockImplementation(() => {});

    applyTransform(transformer, content);

    expect(report.mock.calls.map(call => call[0])).toEqual([
      expect.stringContaining(
        'test.tsx:9: image model settings contain a spread',
      ),
      expect.stringContaining(
        'test.tsx:16: image model settings contain a spread',
      ),
    ]);

    report.mockRestore();
  });
});
