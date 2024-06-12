import { Prompt } from '../prompt/prompt';

export type PromptTemplate<INPUT> = (
  props: INPUT,
) => Promise<PromptTemplateResult>;

const promptTemplateBrand = Symbol('vercel/ai/promptTemplateBrand');

export type PromptTemplateResult = Prompt & {
  __promptTemplateBrand: typeof promptTemplateBrand;
};

export function isPromptTemplateResult(
  result: unknown,
): result is PromptTemplateResult {
  return (
    result != null &&
    typeof result === 'object' &&
    '__promptTemplateBrand' in result &&
    (result as any).__promptTemplateBrand === promptTemplateBrand
  );
}

export function createPromptTemplate<INPUT>(
  template: (props: INPUT) => Promise<Prompt>,
): PromptTemplate<INPUT> {
  return async props => {
    const result = await template(props);

    // in the future, we will in inject more information for observability
    // (which is why a brand is used here - it'll force consumers to use this function)
    return { ...result, __promptTemplateBrand: promptTemplateBrand };
  };
}
