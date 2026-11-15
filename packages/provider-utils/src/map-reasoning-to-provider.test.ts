import { describe, it, expect } from 'vitest';
import type { SharedV4Warning } from '@ai-sdk/provider';
import {
  isCustomReasoning,
  mapReasoningToProviderBudget,
  mapReasoningToProviderEffort,
} from './map-reasoning-to-provider';

const effortMap = {
  minimal: 'low' as const,
  low: 'low' as const,
  medium: 'medium' as const,
  high: 'high' as const,
  xhigh: 'max' as const,
  max: 'max' as const,
};

describe('mapReasoningToProviderEffort', () => {
  it('returns mapped value with no warning for direct match', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'medium',
      effortMap,
      warnings,
    });
    expect(result).toBe('medium');
    expect(warnings).toEqual([]);
  });

  it('returns mapped value with compatibility warning for renamed match', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'minimal',
      effortMap,
      warnings,
    });
    expect(result).toBe('low');
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'reasoning',
        details:
          'reasoning "minimal" is not directly supported by this model. mapped to effort "low".',
      },
    ]);
  });

  it('returns mapped value with compatibility warning for "xhigh"', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'xhigh',
      effortMap,
      warnings,
    });
    expect(result).toBe('max');
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'reasoning',
        details:
          'reasoning "xhigh" is not directly supported by this model. mapped to effort "max".',
      },
    ]);
  });

  it('maps an unsupported level to the next lower supported level', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'xhigh',
      effortMap: { low: 'low', medium: 'medium', high: 'high', max: 'max' },
      warnings,
    });
    expect(result).toBe('high');
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'reasoning',
        details:
          'reasoning "xhigh" is not directly supported by this model. mapped to effort "high".',
      },
    ]);
  });

  it('maps to the next higher supported level when no lower level is supported', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'minimal',
      effortMap: { low: 'low', high: 'high' },
      warnings,
    });
    expect(result).toBe('low');
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'reasoning',
        details:
          'reasoning "minimal" is not directly supported by this model. mapped to effort "low".',
      },
    ]);
  });

  it('does not round a reasoning level down to "none"', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'minimal',
      effortMap: { none: 'none', low: 'low', high: 'high' },
      warnings,
    });
    expect(result).toBe('low');
  });

  it('maps "none" directly when supported', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'none',
      effortMap: { none: 'none', low: 'low' },
      warnings,
    });
    expect(result).toBe('none');
    expect(warnings).toEqual([]);
  });

  it('maps an unsupported "none" to the lowest supported level', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'none',
      effortMap: { low: 'low', medium: 'medium', high: 'high' },
      warnings,
    });
    expect(result).toBe('low');
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'reasoning',
        details:
          'reasoning "none" is not directly supported by this model. mapped to effort "low".',
      },
    ]);
  });

  it('returns undefined with unsupported warning for an empty effortMap', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'high',
      effortMap: {},
      warnings,
    });
    expect(result).toBeUndefined();
    expect(warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'reasoning',
        details: 'reasoning "high" is not supported by this model.',
      },
    ]);
  });
  it('returns the provider options effort unchanged', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'xhigh',
      effortMap: { low: 'low', high: 'high' },
      providerOptionsEffort: 'turbo',
      warnings,
    });
    expect(result).toBe('turbo');
    expect(warnings).toEqual([]);
  });

  it('maps the reasoning value when the provider options effort is null', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderEffort({
      reasoning: 'high',
      effortMap,
      providerOptionsEffort: null,
      warnings,
    });
    expect(result).toBe('high');
    expect(warnings).toEqual([]);
  });

  it.each([undefined, 'provider-default'] as const)(
    'returns undefined with no warning for %s reasoning',
    reasoning => {
      const warnings: SharedV4Warning[] = [];
      const result = mapReasoningToProviderEffort({
        reasoning,
        effortMap,
        warnings,
      });
      expect(result).toBeUndefined();
      expect(warnings).toEqual([]);
    },
  );
});

describe('isCustomReasoning', () => {
  it('returns false for undefined', () => {
    expect(isCustomReasoning(undefined)).toBe(false);
  });

  it('returns false for provider-default', () => {
    expect(isCustomReasoning('provider-default')).toBe(false);
  });

  it('returns true for none', () => {
    expect(isCustomReasoning('none')).toBe(true);
  });

  it('returns true for all reasoning levels', () => {
    for (const value of [
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ] as const) {
      expect(isCustomReasoning(value)).toBe(true);
    }
  });
});

describe('mapReasoningToProviderBudget', () => {
  it('returns correct budget for known key', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderBudget({
      reasoning: 'medium',
      maxOutputTokens: 64000,
      maxReasoningBudget: 64000,
      warnings,
    });
    expect(result).toBe(19200);
    expect(warnings).toEqual([]);
  });

  it('caps result at maxReasoningBudget', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderBudget({
      reasoning: 'xhigh',
      maxOutputTokens: 64000,
      maxReasoningBudget: 50000,
      warnings,
    });
    expect(result).toBe(50000);
    expect(warnings).toEqual([]);
  });

  it('maps max to 95 percent of max output tokens', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderBudget({
      reasoning: 'max',
      maxOutputTokens: 64000,
      maxReasoningBudget: 64000,
      warnings,
    });
    expect(result).toBe(60800);
    expect(warnings).toEqual([]);
  });

  it('floors result at default minReasoningBudget of 1024', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderBudget({
      reasoning: 'minimal',
      maxOutputTokens: 10000,
      maxReasoningBudget: 10000,
      warnings,
    });
    expect(result).toBe(1024);
    expect(warnings).toEqual([]);
  });

  it('respects custom minReasoningBudget', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderBudget({
      reasoning: 'minimal',
      maxOutputTokens: 10000,
      maxReasoningBudget: 10000,
      minReasoningBudget: 512,
      warnings,
    });
    expect(result).toBe(512);
    expect(warnings).toEqual([]);
  });

  it('respects custom budgetPercentages', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderBudget({
      reasoning: 'medium',
      maxOutputTokens: 10000,
      maxReasoningBudget: 10000,
      budgetPercentages: { medium: 0.5 },
      warnings,
    });
    expect(result).toBe(5000);
    expect(warnings).toEqual([]);
  });

  it('uses the default percentage for a level missing from custom budgetPercentages', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderBudget({
      reasoning: 'high',
      maxOutputTokens: 64000,
      maxReasoningBudget: 64000,
      budgetPercentages: { medium: 0.5 },
      warnings,
    });
    expect(result).toBe(38400);
    expect(warnings).toEqual([]);
  });

  it('maps "none" to the minimum reasoning budget', () => {
    const warnings: SharedV4Warning[] = [];
    const result = mapReasoningToProviderBudget({
      reasoning: 'none',
      maxOutputTokens: 64000,
      maxReasoningBudget: 64000,
      minReasoningBudget: 128,
      warnings,
    });
    expect(result).toBe(128);
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'reasoning',
        details:
          'reasoning "none" is not supported by this model. mapped to the minimum reasoning budget of 128 tokens.',
      },
    ]);
  });
});
