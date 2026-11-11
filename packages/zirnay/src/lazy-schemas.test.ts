import { describe, expect, it } from 'vitest';
import {
  zirnayDecisionResponseSchema,
  zirnayFeedbackResponseSchema,
} from './zirnay-decision-api';
import { zirnayDecisionModelOptions } from './zirnay-decision-model-options';

describe('lazy schemas', () => {
  it('instantiates zirnayDecisionResponseSchema successfully', () => {
    expect(() => zirnayDecisionResponseSchema()).not.toThrow();
  });

  it('instantiates zirnayFeedbackResponseSchema successfully', () => {
    expect(() => zirnayFeedbackResponseSchema()).not.toThrow();
  });

  it('instantiates zirnayDecisionModelOptions successfully', () => {
    expect(() => zirnayDecisionModelOptions()).not.toThrow();
  });
});
