import { CallSettings } from '../prompt/call-settings';
import { Prompt } from '../prompt/prompt';
import { LanguageModel } from '../types/language-model';

const blueprintBrand = Symbol('vercel/ai/blueprint');

export type BlueprintValues = { model?: LanguageModel } & Prompt &
  Omit<CallSettings, 'abortSignal' | 'maxRetries'>;

export type BlueprintResult = BlueprintValues & {
  __blueprintBrand: typeof blueprintBrand;
};

export type Blueprint<INPUT> = (props: INPUT) => Promise<BlueprintResult>;

export function isBlueprintResult(result: unknown): result is BlueprintResult {
  return (
    result != null &&
    typeof result === 'object' &&
    '__blueprintBrand' in result &&
    result.__blueprintBrand === blueprintBrand
  );
}

export function createBlueprint<INPUT>(
  template: (props: INPUT) => Promise<BlueprintValues>,
): Blueprint<INPUT> {
  return async props => {
    const result = await template(props);

    // in the future, we will in inject more information for observability
    // such as the input values, an optional function id, and optional metadata
    // (which is why a brand is used here - it'll force consumers to use this function)
    return { ...result, __blueprintBrand: blueprintBrand };
  };
}
