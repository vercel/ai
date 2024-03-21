import { LanguageModelV1FinishReason } from '../ai-model-specification';

export function mapMistralFinishReason(
  finishReason: string | null | undefined,
): LanguageModelV1FinishReason {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
    case 'model_length':
      return 'length';
    default:
      return 'other';
  }
}
