import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { mapUsage } from './opencode-usage';
import { asOpenCodeObject } from './opencode-types';

type FinishStepEvent = Extract<HarnessV1StreamPart, { type: 'finish-step' }>;

export function mapOpenCodeFinishReason(
  reason: string,
): 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' {
  const normalized = reason.toLowerCase();
  if (normalized.includes('length')) return 'length';
  if (normalized.includes('filter')) return 'content-filter';
  if (normalized.includes('tool')) return 'tool-calls';
  if (normalized.includes('error') || normalized.includes('fail'))
    return 'error';
  if (normalized === 'stop' || normalized === 'end') return 'stop';
  return 'other';
}

export function legacyStepFinishPartToFinishStep(
  part: unknown,
): FinishStepEvent | undefined {
  return translateLegacyStepFinishPart(part)?.event;
}

export function translateLegacyStepFinishPart(
  value: unknown,
): { event: FinishStepEvent; partId?: string } | undefined {
  const part = asOpenCodeObject(value);
  if (!part || part.type !== 'step-finish') return undefined;
  const rawFinish = typeof part.reason === 'string' ? part.reason : 'stop';
  const event: FinishStepEvent = {
    type: 'finish-step',
    finishReason: {
      unified: mapOpenCodeFinishReason(rawFinish),
      raw: rawFinish,
    },
    usage: mapUsage(part.tokens),
    ...(typeof part.cost === 'number'
      ? { harnessMetadata: { opencode: { cost: part.cost } } }
      : {}),
  };
  return {
    event,
    ...(typeof part.id === 'string' ? { partId: part.id } : {}),
  };
}
