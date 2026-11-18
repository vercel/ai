import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { mapReasoningToProviderEffort } from '@ai-sdk/provider-utils';

type OpenAIReasoningEffort = Exclude<
  LanguageModelV4CallOptions['reasoning'],
  'provider-default' | undefined
>;

const allOpenAIReasoningEfforts: readonly OpenAIReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/** Resolve portable reasoning against the efforts declared by the catalog. */
export function resolveOpenAIReasoningEffort({
  providerReasoningEffort,
  reasoning,
  supportedReasoningEfforts,
  warnings,
}: {
  providerReasoningEffort: string | null | undefined;
  reasoning: LanguageModelV4CallOptions['reasoning'];
  supportedReasoningEfforts: readonly string[] | undefined;
  warnings: SharedV4Warning[];
}): string | undefined {
  return mapReasoningToProviderEffort({
    reasoning,
    providerOptionsEffort: providerReasoningEffort,
    effortMap: Object.fromEntries(
      (supportedReasoningEfforts ?? allOpenAIReasoningEfforts).map(effort => [
        effort,
        effort,
      ]),
    ),
    warnings,
  });
}
