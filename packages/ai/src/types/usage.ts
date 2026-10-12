import type {
  ImageModelV4Usage,
  JSONObject,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

/**
 * Represents the number of tokens used in a prompt and completion.
 */
export type LanguageModelUsage = {
  /**
   * The total number of input (prompt) tokens used.
   */
  inputTokens: number | undefined;

  /**
   * Detailed information about the input tokens.
   */
  inputTokenDetails: {
    /**
     * The number of non-cached input (prompt) tokens used.
     */
    noCacheTokens: number | undefined;

    /**
     * The number of cached input (prompt) tokens read.
     */
    cacheReadTokens: number | undefined;

    /**
     * The number of cached input (prompt) tokens written.
     */
    cacheWriteTokens: number | undefined;
  };

  /**
   * The number of total output (completion) tokens used.
   */
  outputTokens: number | undefined;

  /**
   * Detailed information about the output tokens.
   */
  outputTokenDetails: {
    /**
     * The number of text tokens used.
     */
    textTokens: number | undefined;

    /**
     * The number of reasoning tokens used.
     */
    reasoningTokens: number | undefined;
  };

  /**
   * The total number of tokens used.
   */
  totalTokens: number | undefined;

  /**
   * Token counts that are partial because at least one model call did not
   * report the corresponding count.
   *
   * A count that is `undefined` and is not listed here is entirely unknown.
   * A numeric count that is not listed here includes all aggregated model
   * calls.
   */
  incompleteTokenCounts?: {
    inputTokens?: true;
    inputTokenDetails?: {
      noCacheTokens?: true;
      cacheReadTokens?: true;
      cacheWriteTokens?: true;
    };
    outputTokens?: true;
    outputTokenDetails?: {
      textTokens?: true;
      reasoningTokens?: true;
    };
    totalTokens?: true;
  };

  /**
   * Raw usage information from the provider.
   *
   * This is the usage information in the shape that the provider returns.
   * It can include additional information that is not part of the standard usage information.
   */
  raw?: JSONObject;
};

/**
 * Represents the number of tokens used in an embedding.
 */
// TODO replace with EmbeddingModelV4Usage once available in @ai-sdk/provider
export type EmbeddingModelUsage = {
  /**
   * The number of tokens used in the embedding.
   */
  tokens: number;
};

export function asLanguageModelUsage(
  usage: LanguageModelV4Usage,
): LanguageModelUsage {
  const totalTokens = addTokenCounts(
    usage.inputTokens.total,
    usage.outputTokens.total,
  );

  return {
    inputTokens: usage.inputTokens.total,
    inputTokenDetails: {
      noCacheTokens: usage.inputTokens.noCache,
      cacheReadTokens: usage.inputTokens.cacheRead,
      cacheWriteTokens: usage.inputTokens.cacheWrite,
    },
    outputTokens: usage.outputTokens.total,
    outputTokenDetails: {
      textTokens: usage.outputTokens.text,
      reasoningTokens: usage.outputTokens.reasoning,
    },
    totalTokens,
    ...(totalTokens != null &&
    (usage.inputTokens.total == null || usage.outputTokens.total == null)
      ? { incompleteTokenCounts: { totalTokens: true } }
      : {}),
    raw: usage.raw,
  };
}

const nullLanguageModelUsageSymbol = Symbol('nullLanguageModelUsage');

export function createNullLanguageModelUsage(): LanguageModelUsage {
  const usage: LanguageModelUsage = {
    inputTokens: undefined,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens: undefined,
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
    totalTokens: undefined,
    raw: undefined,
  };

  Object.defineProperty(usage, nullLanguageModelUsageSymbol, { value: true });

  return usage;
}

export function addLanguageModelUsage(
  usage1: LanguageModelUsage,
  usage2: LanguageModelUsage,
): LanguageModelUsage {
  if (isNullLanguageModelUsage(usage1)) {
    return withoutUndefinedRawUsage(usage2);
  }

  if (isNullLanguageModelUsage(usage2)) {
    return withoutUndefinedRawUsage(usage1);
  }

  const inputTokens = addLanguageModelTokenCounts({
    tokenCount1: usage1.inputTokens,
    tokenCount2: usage2.inputTokens,
    incomplete1: usage1.incompleteTokenCounts?.inputTokens,
    incomplete2: usage2.incompleteTokenCounts?.inputTokens,
  });
  const noCacheTokens = addLanguageModelTokenCounts({
    tokenCount1: usage1.inputTokenDetails?.noCacheTokens,
    tokenCount2: usage2.inputTokenDetails?.noCacheTokens,
    incomplete1: usage1.incompleteTokenCounts?.inputTokenDetails?.noCacheTokens,
    incomplete2: usage2.incompleteTokenCounts?.inputTokenDetails?.noCacheTokens,
  });
  const cacheReadTokens = addLanguageModelTokenCounts({
    tokenCount1: usage1.inputTokenDetails?.cacheReadTokens,
    tokenCount2: usage2.inputTokenDetails?.cacheReadTokens,
    incomplete1:
      usage1.incompleteTokenCounts?.inputTokenDetails?.cacheReadTokens,
    incomplete2:
      usage2.incompleteTokenCounts?.inputTokenDetails?.cacheReadTokens,
  });
  const cacheWriteTokens = addLanguageModelTokenCounts({
    tokenCount1: usage1.inputTokenDetails?.cacheWriteTokens,
    tokenCount2: usage2.inputTokenDetails?.cacheWriteTokens,
    incomplete1:
      usage1.incompleteTokenCounts?.inputTokenDetails?.cacheWriteTokens,
    incomplete2:
      usage2.incompleteTokenCounts?.inputTokenDetails?.cacheWriteTokens,
  });
  const outputTokens = addLanguageModelTokenCounts({
    tokenCount1: usage1.outputTokens,
    tokenCount2: usage2.outputTokens,
    incomplete1: usage1.incompleteTokenCounts?.outputTokens,
    incomplete2: usage2.incompleteTokenCounts?.outputTokens,
  });
  const textTokens = addLanguageModelTokenCounts({
    tokenCount1: usage1.outputTokenDetails?.textTokens,
    tokenCount2: usage2.outputTokenDetails?.textTokens,
    incomplete1: usage1.incompleteTokenCounts?.outputTokenDetails?.textTokens,
    incomplete2: usage2.incompleteTokenCounts?.outputTokenDetails?.textTokens,
  });
  const reasoningTokens = addLanguageModelTokenCounts({
    tokenCount1: usage1.outputTokenDetails?.reasoningTokens,
    tokenCount2: usage2.outputTokenDetails?.reasoningTokens,
    incomplete1:
      usage1.incompleteTokenCounts?.outputTokenDetails?.reasoningTokens,
    incomplete2:
      usage2.incompleteTokenCounts?.outputTokenDetails?.reasoningTokens,
  });
  const totalTokens = addLanguageModelTokenCounts({
    tokenCount1: usage1.totalTokens,
    tokenCount2: usage2.totalTokens,
    incomplete1: usage1.incompleteTokenCounts?.totalTokens,
    incomplete2: usage2.incompleteTokenCounts?.totalTokens,
  });

  const inputTokenDetailsIncomplete =
    noCacheTokens.incomplete ||
    cacheReadTokens.incomplete ||
    cacheWriteTokens.incomplete;
  const outputTokenDetailsIncomplete =
    textTokens.incomplete || reasoningTokens.incomplete;
  const hasIncompleteTokenCounts =
    inputTokens.incomplete ||
    inputTokenDetailsIncomplete ||
    outputTokens.incomplete ||
    outputTokenDetailsIncomplete ||
    totalTokens.incomplete;

  return {
    inputTokens: inputTokens.value,
    inputTokenDetails: {
      noCacheTokens: noCacheTokens.value,
      cacheReadTokens: cacheReadTokens.value,
      cacheWriteTokens: cacheWriteTokens.value,
    },
    outputTokens: outputTokens.value,
    outputTokenDetails: {
      textTokens: textTokens.value,
      reasoningTokens: reasoningTokens.value,
    },
    totalTokens: totalTokens.value,
    ...(hasIncompleteTokenCounts
      ? {
          incompleteTokenCounts: {
            ...(inputTokens.incomplete ? { inputTokens: true as const } : {}),
            ...(inputTokenDetailsIncomplete
              ? {
                  inputTokenDetails: {
                    ...(noCacheTokens.incomplete
                      ? { noCacheTokens: true as const }
                      : {}),
                    ...(cacheReadTokens.incomplete
                      ? { cacheReadTokens: true as const }
                      : {}),
                    ...(cacheWriteTokens.incomplete
                      ? { cacheWriteTokens: true as const }
                      : {}),
                  },
                }
              : {}),
            ...(outputTokens.incomplete ? { outputTokens: true as const } : {}),
            ...(outputTokenDetailsIncomplete
              ? {
                  outputTokenDetails: {
                    ...(textTokens.incomplete
                      ? { textTokens: true as const }
                      : {}),
                    ...(reasoningTokens.incomplete
                      ? { reasoningTokens: true as const }
                      : {}),
                  },
                }
              : {}),
            ...(totalTokens.incomplete ? { totalTokens: true as const } : {}),
          },
        }
      : {}),
  };
}

function isNullLanguageModelUsage(usage: LanguageModelUsage): boolean {
  return (
    (
      usage as LanguageModelUsage & {
        [nullLanguageModelUsageSymbol]?: true;
      }
    )[nullLanguageModelUsageSymbol] === true
  );
}

function withoutUndefinedRawUsage(
  usage: LanguageModelUsage,
): LanguageModelUsage {
  if (usage.raw != null) {
    return usage;
  }

  const { raw: _raw, ...usageWithoutRaw } = usage;
  return usageWithoutRaw;
}

function addLanguageModelTokenCounts({
  tokenCount1,
  tokenCount2,
  incomplete1,
  incomplete2,
}: {
  tokenCount1: number | undefined;
  tokenCount2: number | undefined;
  incomplete1: true | undefined;
  incomplete2: true | undefined;
}): { value: number | undefined; incomplete: boolean } {
  const value = addTokenCounts(tokenCount1, tokenCount2);

  return {
    value,
    incomplete:
      value != null &&
      (tokenCount1 == null ||
        tokenCount2 == null ||
        incomplete1 === true ||
        incomplete2 === true),
  };
}

function addTokenCounts(
  tokenCount1: number | undefined,
  tokenCount2: number | undefined,
): number | undefined {
  return tokenCount1 == null && tokenCount2 == null
    ? undefined
    : (tokenCount1 ?? 0) + (tokenCount2 ?? 0);
}

/**
 * Usage information for an image model call.
 */
export type ImageModelUsage = ImageModelV4Usage;

export function addImageModelUsage(
  usage1: ImageModelUsage,
  usage2: ImageModelUsage,
): ImageModelUsage {
  return {
    inputTokens: addTokenCounts(usage1.inputTokens, usage2.inputTokens),
    outputTokens: addTokenCounts(usage1.outputTokens, usage2.outputTokens),
    totalTokens: addTokenCounts(usage1.totalTokens, usage2.totalTokens),
  };
}
