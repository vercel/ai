export type OpenAILanguageModelCapabilities = {
  isReasoningModel: boolean;
  systemMessageMode: 'remove' | 'system' | 'developer';
  supportsFlexProcessing: boolean;
  supportsPriorityProcessing: boolean;

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

<<<<<<< HEAD
  const isReasoningModel = !(
    modelId.startsWith('gpt-3') ||
    modelId.startsWith('gpt-4') ||
    modelId.startsWith('chatgpt-4o') ||
    modelId.startsWith('gpt-5-chat')
  );
=======
  // Only recognizable OpenAI model families should use the developer role.
  // Fine-tuned, third-party, and custom model IDs keep conservative defaults.
  const isReasoningModel =
    oSeriesVersion != null ||
    (gptVersion != null && gptVersion.major >= 5 && !isGptChatModel);
>>>>>>> 34c53c0ff1 (fix: new OpenAI model versions falling back to incompatible legacy request defaults (#17820))

  // https://platform.openai.com/docs/guides/latest-model#gpt-5-1-parameter-compatibility
  // GPT-5.1, GPT-5.2, and GPT-5.4 support temperature, topP, logProbs when reasoningEffort is none
  const supportsNonReasoningParameters =
<<<<<<< HEAD
    modelId.startsWith('gpt-5.1') ||
    modelId.startsWith('gpt-5.2') ||
    modelId.startsWith('gpt-5.3') ||
    modelId.startsWith('gpt-5.4') ||
    modelId.startsWith('gpt-5.6');
=======
    gptVersion != null &&
    (gptVersion.major > 5 ||
      (gptVersion.major === 5 && (gptVersion.minor ?? 0) >= 1));
>>>>>>> 34c53c0ff1 (fix: new OpenAI model versions falling back to incompatible legacy request defaults (#17820))

  const systemMessageMode = isReasoningModel ? 'developer' : 'system';

  return {
    supportsFlexProcessing,
    supportsPriorityProcessing,
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
