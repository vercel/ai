import type { FinishReason } from '../types/language-model';

export function isToolExecutionAllowedFinishReason(
  finishReason: FinishReason,
): boolean {
  return finishReason === 'stop' || finishReason === 'tool-calls';
}
