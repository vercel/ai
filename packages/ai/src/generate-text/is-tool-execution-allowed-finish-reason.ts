import type { FinishReason } from '../types';

export function isToolExecutionAllowedFinishReason(
  finishReason: FinishReason,
): boolean {
  return finishReason === 'stop' || finishReason === 'tool-calls';
}
