import { describe, expect, it } from 'vitest';
import { isDeepSeekV4Model } from './is-deepseek-v4-model';

describe('isDeepSeekV4Model', () => {
  it.each([
    'deepseek-v4-pro',
    'deepseek-v4-pro-0813',
    'deepseek-v4-flash',
    'deepseek-v4-flash-0731',
    'deepseek-v4-flash-vision-exp',
    'deepseek-flash',
    'deepseek-pro',
  ])('should treat %s as V4', modelId => {
    expect(isDeepSeekV4Model(modelId)).toBe(true);
  });

  it.each(['deepseek-chat', 'deepseek-reasoner'])(
    'should not treat legacy %s as V4',
    modelId => {
      expect(isDeepSeekV4Model(modelId)).toBe(false);
    },
  );
});
