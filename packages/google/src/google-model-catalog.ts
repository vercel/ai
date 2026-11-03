import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { GoogleLanguageModelOptions } from './google-language-model-options';

const gemini1ModelPattern = /(^|[/.])gemini-1(?:[.-]|$)/i;
const gemini2ModelPattern = /(^|[/.])gemini-2(?:[.-]|$)/i;
const gemini25ModelPattern = /(^|[/.])gemini-2\.5(?:[.-]|$)/i;
const geminiModelPattern = /(^|[/.])gemini-/i;

type GoogleLanguageProviderOption = keyof GoogleLanguageModelOptions;

/** Options accepted under providerOptions.google (or googleVertex on Vertex). */
export const googleProviderOptions = {
  language: {
    responseModalities: { description: 'Response modalities to generate.' },
    thinkingConfig: {
      description: 'Thinking budget, level, and thought output.',
    },
    cachedContent: { description: 'Cached content to use as request context.' },
    structuredOutputs: {
      description: 'Whether to send the JSON response schema.',
    },
    safetySettings: { description: 'Safety settings for the request.' },
    threshold: {
      description: 'Default threshold for configurable safety categories.',
    },
    audioTimestamp: {
      description: 'Enable timestamp understanding for audio.',
    },
    labels: { description: 'Billing labels. Vertex AI only.' },
    mediaResolution: {
      description: 'Resolution used to process media inputs.',
    },
    imageConfig: { description: 'Image generation configuration.' },
    retrievalConfig: { description: 'Retrieval configuration for tools.' },
    streamFunctionCallArguments: {
      description: 'Stream function arguments. Vertex AI only.',
    },
    serviceTier: { description: 'Service tier. Gemini API only.' },
    continuationToken: {
      description: 'Resume a response using its continuation token.',
    },
    sharedRequestType: { description: 'Shared PayGo tier. Vertex AI only.' },
    requestType: { description: 'Request routing type. Vertex AI only.' },
  } satisfies Record<GoogleLanguageProviderOption, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

type GoogleLanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  tools: NonNullable<ModelCapabilities['language']>['tools'] & {
    /** Existing request gate for Gemini 2 provider-defined tools. */
    gemini2: boolean;
    googleSearch: ModelCapability;
    urlContext: ModelCapability;
    fileSearch: boolean;
    mixed: boolean;
    functionResponseParts: boolean;
  };
  reasoning: NonNullable<ModelCapabilities['language']>['reasoning'] & {
    minBudget: number;
    maxBudget: number;
  };
  sampling: NonNullable<ModelCapabilities['language']>['sampling'] & {
    topK: ModelCapability;
    penalties: ModelCapability;
  };
  structuredOutput: {
    withFunctionTools: boolean;
  };
};

type GoogleLanguageRequestConfig = {
  systemInstruction: 'system' | 'user';
  thinkingFormat: 'level' | 'budget';
  reasoningMaxOutputTokens: number;
  jsonResponseTool: boolean;
};

export type GoogleLanguageModelEntry = ModelEntry<{
  language: GoogleLanguageRequestConfig;
}> & {
  capabilities: { language: GoogleLanguageCapabilities };
  providerOptions: {
    language: Record<GoogleLanguageProviderOption, ModelCapability>;
  };
  requestConfig: { language: GoogleLanguageRequestConfig };
};

type DocumentedCapabilities = {
  image: boolean;
  objectGeneration: boolean;
  tools: boolean;
  streaming: boolean;
  googleSearch: boolean;
  urlContext: boolean;
};

// Preserve the existing documentation's model set and per-model exceptions.
const standard = {
  image: true,
  objectGeneration: true,
  tools: true,
  streaming: true,
  googleSearch: true,
  urlContext: true,
} as const;

const documentedModels: Record<string, DocumentedCapabilities> = {
  'gemini-nano-banana-2.1': {
    image: true,
    objectGeneration: false,
    tools: false,
    streaming: false,
    googleSearch: true,
    urlContext: false,
  },
  'gemini-4-argon': standard,
  'gemini-3.8-flash': standard,
  'gemini-3.7-flash': standard,
  'gemini-3.6-flash': standard,
  'gemini-3.5-flash': standard,
  'gemini-3.5-flash-lite': standard,
  'gemini-3.1-pro-preview': standard,
  'gemini-3.1-flash-image-preview': standard,
  'gemini-3.1-flash-lite-preview': standard,
  'gemini-3-pro-preview': standard,
  'gemini-3-pro-image-preview': standard,
  'gemini-3-flash-preview': standard,
  'gemini-2.5-pro': standard,
  'gemini-2.5-flash': standard,
  'gemini-2.5-flash-lite': standard,
  'gemini-2.5-flash-lite-preview-06-17': standard,
  'gemini-2.0-flash': standard,
};

export const googleModelCatalog: Readonly<
  Record<string, GoogleLanguageModelEntry>
> = Object.fromEntries(
  Object.entries(documentedModels).map(([modelId, documented]) => [
    modelId,
    createGoogleLanguageModelEntry(modelId, documented),
  ]),
);

export function getGoogleLanguageModelEntry(
  modelId: string,
): GoogleLanguageModelEntry {
  return Object.prototype.hasOwnProperty.call(googleModelCatalog, modelId)
    ? googleModelCatalog[modelId]
    : createGoogleLanguageModelEntry(modelId);
}

function createGoogleLanguageModelEntry(
  modelId: string,
  documented?: DocumentedCapabilities,
): GoogleLanguageModelEntry {
  const runtime = resolveRuntimeDefinition(modelId);
  const declared = documented != null;
  const id = modelId.toLowerCase();
  // Preserve the original case-sensitive exception in the thinking resolver.
  const thinkingFormat =
    runtime.usesGemini3Features && !modelId.includes('gemini-3-pro-image')
      ? 'level'
      : 'budget';
  const minLevel = getMinimumThinkingLevelForGemini3Model(modelId);
  const language: GoogleLanguageCapabilities = {
    inputs: { image: documented?.image ?? 'unknown', audio: 'unknown' },
    objectGeneration: documented?.objectGeneration ?? 'unknown',
    tools: {
      usage: documented?.tools ?? 'unknown',
      streaming: documented?.streaming ?? 'unknown',
      gemini2: runtime.supportsGemini2Tools,
      googleSearch: documented?.googleSearch ?? 'unknown',
      urlContext: documented?.urlContext ?? 'unknown',
      fileSearch: runtime.supportsFileSearch,
      mixed: runtime.usesGemini3Features,
      functionResponseParts: runtime.usesGemini3Features,
    },
    reasoning: {
      support: 'unknown',
      efforts:
        thinkingFormat === 'level'
          ? [
              ...(minLevel === 'minimal' ? ['minimal'] : []),
              'low',
              'medium',
              'high',
            ]
          : undefined,
      minBudget: id.includes('2.5-pro') ? 128 : 0,
      maxBudget:
        id.includes('2.5-pro') || id.includes('gemini-3-pro-image')
          ? 32768
          : 24576,
    },
    sampling: {
      temperature: 'unknown',
      topP: 'unknown',
      topK: 'unknown',
      logprobs: false,
      penalties: gemini25ModelPattern.test(modelId)
        ? { condition: 'Only supported on the Vertex AI API.' }
        : true,
    },
    structuredOutput: {
      withFunctionTools: runtime.usesGemini3Features,
    },
  };

  return {
    capabilities: { language },
    providerOptions: {
      language: declareProviderOptions(declared ? true : 'unknown', {
        labels: { condition: 'Only supported on the Vertex AI API.' },
        sharedRequestType: {
          condition: 'Only supported on the Vertex AI API.',
        },
        requestType: { condition: 'Only supported on the Vertex AI API.' },
        serviceTier: { condition: 'Only supported on the Gemini API.' },
        streamFunctionCallArguments: {
          condition:
            'Only supported for streaming requests on the Vertex AI API with Gemini 3 or newer.',
        },
      }),
    },
    requestConfig: {
      language: {
        systemInstruction: id.startsWith('gemma-') ? 'user' : 'system',
        thinkingFormat,
        reasoningMaxOutputTokens: 65536,
        jsonResponseTool: /(^|\/)gemini-/i.test(modelId),
      },
    },
  };
}

function declareProviderOptions(
  support: ModelCapability,
  exceptions: Partial<Record<GoogleLanguageProviderOption, ModelCapability>>,
): Record<GoogleLanguageProviderOption, ModelCapability> {
  return Object.fromEntries(
    (
      Object.keys(
        googleProviderOptions.language,
      ) as GoogleLanguageProviderOption[]
    ).map(option => [option, exceptions[option] ?? support]),
  ) as Record<GoogleLanguageProviderOption, ModelCapability>;
}

function isKnownPreGemini2Model(modelId: string): boolean {
  return (
    gemini1ModelPattern.test(modelId) ||
    /(^|[/.])gemini-pro(?:-vision)?$/i.test(modelId) ||
    /(^|[/.])gemini-robotics-er-1\.5(?:[.-]|$)/i.test(modelId)
  );
}

/**
 * Classifies Gemini capabilities by excluding known older generations.
 *
 * Google model IDs are open-ended, so unrecognized Gemini IDs and aliases
 * intentionally inherit the newest supported behavior. Add exceptions here
 * only when a model is known to require a legacy request shape.
 */
function resolveRuntimeDefinition(modelId: string) {
  const isGeminiModel = geminiModelPattern.test(modelId);
  const isGemini2Model = gemini2ModelPattern.test(modelId);
  const isKnownPreGemini2 = isKnownPreGemini2Model(modelId);
  const isKnownOlderModel = isKnownPreGemini2 || isGemini2Model;
  const usesGemini3Features = isGeminiModel && !isKnownOlderModel;

  return {
    supportsGemini2Tools:
      (isGeminiModel && !isKnownPreGemini2) ||
      modelId.toLowerCase().includes('nano-banana'),
    supportsFileSearch:
      gemini25ModelPattern.test(modelId) || usesGemini3Features,
    usesGemini3Features,
  };
}

function getMinimumThinkingLevelForGemini3Model(
  modelId: string,
): 'minimal' | 'low' {
  const modelName = /(?:^|[/.])(gemini-[^/]*)$/i
    .exec(modelId)?.[1]
    .toLowerCase();

  if (modelName === 'gemini-flash-latest') {
    return 'low';
  }

  const proVersionMatch = /^gemini-(\d+)(?:\.\d+)?-pro(?:$|-)/.exec(
    modelName ?? '',
  );

  if (Number(proVersionMatch?.[1]) >= 3) {
    return 'low';
  }

  const versionMatch = /^gemini-(\d+)\.(\d+)-flash(?:$|-(?!lite(?:-|$)))/.exec(
    modelName ?? '',
  );

  if (versionMatch == null) {
    return 'minimal';
  }

  const majorVersion = Number(versionMatch[1]);
  const minorVersion = Number(versionMatch[2]);

  return majorVersion > 3 || (majorVersion === 3 && minorVersion >= 7)
    ? 'low'
    : 'minimal';
}
