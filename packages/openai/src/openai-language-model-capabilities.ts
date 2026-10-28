import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { mapReasoningToProviderEffort } from '@ai-sdk/provider-utils';

type OpenAIReasoningEffort = Exclude<
  LanguageModelV4CallOptions['reasoning'],
  'provider-default' | undefined
>;

// Unknown model families send the reasoning value directly.
const ALL_OPENAI_REASONING_EFFORTS: readonly OpenAIReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export type OpenAILanguageModelCapabilities = {
  isReasoningModel: boolean;
  systemMessageMode: 'remove' | 'system' | 'developer';
  supportsFlexProcessing: boolean;
  supportsPriorityProcessing: boolean;
  supportsConfigurationUpdate: boolean;
  supportsAsyncToolCalling: boolean;
  /**
   * Reasoning efforts supported by the model family, or `undefined` when they
   * are not known.
   */
  supportedReasoningEfforts: readonly OpenAIReasoningEffort[] | undefined;

  /**
   * Allow temperature, topP, logProbs when reasoningEffort is none.
   */
  supportsNonReasoningParameters: boolean;
};

export function getOpenAILanguageModelCapabilities(
  modelId: string,
): OpenAILanguageModelCapabilities {
  const oSeriesVersion = getOSeriesVersion(modelId);
  const gptVersion = getGptVersion(modelId);
  const isGptChatModel =
    gptVersion?.minor == null &&
    (gptVersion?.variant?.startsWith('chat') ?? false);
  const isGptNanoModel = gptVersion?.variant?.startsWith('nano') ?? false;
  const isGpt6OrLaterModel = gptVersion != null && gptVersion.major >= 6;

  const isGpt6OrLaterModelWithNoneEffort =
    modelId === 'gpt-6-sol' ||
    modelId === 'gpt-6-luna' ||
    modelId === 'gpt-6.1-terra';

  const supportsFlexProcessing =
    (oSeriesVersion != null && oSeriesVersion >= 3) ||
    (gptVersion != null && gptVersion.major >= 5 && !isGptChatModel);

  const supportsPriorityProcessing =
    modelId.startsWith('gpt-4') ||
    (gptVersion != null &&
      gptVersion.major >= 5 &&
      !isGptNanoModel &&
      !isGptChatModel) ||
    (oSeriesVersion != null && oSeriesVersion >= 3);

  // Only recognizable OpenAI model families should use the developer role.
  // Fine-tuned, third-party, and custom model IDs keep conservative defaults.
  const isReasoningModel =
    oSeriesVersion != null ||
    (gptVersion != null && gptVersion.major >= 5 && !isGptChatModel);

  // https://platform.openai.com/docs/guides/latest-model#gpt-5-1-parameter-compatibility
  // GPT-5.1 through GPT-5.x, GPT-6 Sol/Luna, and GPT-6.1 Terra support
  // temperature, topP, and logProbs when reasoningEffort is none.
  const supportsNonReasoningParameters =
    isGpt6OrLaterModelWithNoneEffort ||
    (!isGpt6OrLaterModel &&
      gptVersion != null &&
      (gptVersion.major > 5 ||
        (gptVersion.major === 5 && (gptVersion.minor ?? 0) >= 1)));

  const systemMessageMode = isReasoningModel ? 'developer' : 'system';

  return {
    supportsFlexProcessing,
    supportsPriorityProcessing,
    supportsConfigurationUpdate: isGpt6OrLaterModel,
    supportsAsyncToolCalling: isGpt6OrLaterModel,
    supportedReasoningEfforts: isGpt6OrLaterModelWithNoneEffort
      ? ['none', 'low', 'medium', 'high', 'xhigh', 'max']
      : isGpt6OrLaterModel
        ? ['low', 'medium', 'high', 'xhigh', 'max']
        : undefined,
    isReasoningModel,
    systemMessageMode,
    supportsNonReasoningParameters,
  };
}

function getOSeriesVersion(modelId: string): number | undefined {
  const match = /^o(\d+)(?:-|$)/.exec(modelId);
  return match == null ? undefined : Number(match[1]);
}

function getGptVersion(modelId: string):
  | {
      major: number;
      minor: number | undefined;
      variant: string | undefined;
    }
  | undefined {
  const match = /^gpt-(\d+)(?:\.(\d+))?(?:-(.+))?$/.exec(modelId);

  if (match == null) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: match[2] == null ? undefined : Number(match[2]),
    variant: match[3],
  };
}

/**
 * Resolves the reasoning effort to send to OpenAI.
 *
 * A reasoning effort from provider options is sent unchanged. Otherwise the
 * top-level reasoning value is mapped to the closest effort that the model
 * family supports, or sent directly when the supported efforts are not known.
 */
export function resolveOpenAIReasoningEffort({
  providerReasoningEffort,
  reasoning,
  supportedReasoningEfforts,
  warnings,
}: {
  providerReasoningEffort: string | null | undefined;
  reasoning: LanguageModelV4CallOptions['reasoning'];
  supportedReasoningEfforts: readonly OpenAIReasoningEffort[] | undefined;
  warnings: SharedV4Warning[];
}): string | undefined {
  return mapReasoningToProviderEffort({
    reasoning,
    providerOptionsEffort: providerReasoningEffort,
    effortMap: Object.fromEntries(
      (supportedReasoningEfforts ?? ALL_OPENAI_REASONING_EFFORTS).map(
        effort => [effort, effort],
      ),
    ),
    warnings,
  });
}
