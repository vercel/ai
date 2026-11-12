import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { QuiverAILanguageModelOptions } from './quiverai-language-model-options';
import type { QuiverAIImageModelOptions } from './quiverai-image-model-options';

export const quiveraiProviderOptions = {
  language: {
    reasoningEffort: {
      description: 'Controls the amount of reasoning used by the model.',
    },
    reasoningSummary: {
      description: "Requests the model's safe reasoning summary.",
    },
  } satisfies Record<
    keyof QuiverAILanguageModelOptions,
    ProviderOptionDefinition
  >,
  image: {
    operation: {
      description:
        'The operation to perform. Defaults to `generate`. - `generate`: Text-to-SVG generation. Requires `prompt`. - `vectorize`: Convert an input raster image into an SVG. Requires a single image in `prompt.images` / `files`. - `animate`: Animate an input SVG. Requires a single SVG in `prompt.images` / `files`; the text prompt is optional. - `edit`: Edit a single SVG from `prompt.images` using `prompt.text` as the required instruction.',
    },
    instructions: {
      description: 'Extra style guidance for prompt-based generation.',
    },
    reasoningEffort: {
      description: 'Reasoning effort applied to generation or vectorization.',
    },
    referenceImages: {
      description:
        'Optional reference images for SVG editing. Use `prepareQuiverAIImageReference` to convert binary inputs.',
    },
    maxReviewSteps: {
      description: 'Maximum number of edit review and redo steps (0-5).',
    },
    attributes: {
      description:
        'SVG root attributes requested for generation or vectorization.',
    },
    temperature: { description: 'Sampling temperature (0-2).' },
    topP: { description: 'Nucleus sampling top-p (0-1).' },
    presencePenalty: { description: 'Presence penalty (-2 to 2).' },
    maxOutputTokens: {
      description:
        'Maximum number of output tokens (1 - 65536 for Arrow 2 models). The legacy upper bound of 131072 is retained for other model IDs.',
    },
    orchestratorMaxOutputTokens: {
      description:
        'Provider orchestrator token budget for SVG editing (1-65536).',
    },
    shallowMaxOutputTokens: {
      description:
        'Provider shallow edit token budget for SVG editing (1-65536).',
    },
    autoCrop: {
      description:
        'Whether to auto-crop the input image before vectorization. Only used when `operation` is `vectorize`.',
    },
    targetSize: {
      description:
        'Target canvas size in pixels for vectorization (128 - 4096). Only used when `operation` is `vectorize`.',
    },
  } satisfies Record<keyof QuiverAIImageModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

export const quiveraiLanguageModelIds = ['arrow-2', 'arrow-2-telos'] as const;
export const quiveraiImageModelIds = [
  'arrow-1',
  'arrow-1.1',
  'arrow-1.1-max',
  'arrow-2',
  'arrow-2-telos',
] as const;

export const quiveraiRequestDefaults = {
  language: {
    structuredOutputs: false,
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  image: { maxImagesPerCall: 16 },
} as const;
const imagePolicies: Record<
  string,
  { generateReferenceLimit: number; maxOutputTokens?: number; arrow2?: boolean }
> = {
  'arrow-1': { generateReferenceLimit: 4 },
  'arrow-1.0': { generateReferenceLimit: 4 },
  'arrow-1.1': { generateReferenceLimit: 4 },
  'arrow-1.1-max': { generateReferenceLimit: 16 },
  'arrow-2': {
    generateReferenceLimit: 16,
    maxOutputTokens: 65536,
    arrow2: true,
  },
  'arrow-2-telos': {
    generateReferenceLimit: 16,
    maxOutputTokens: 65536,
    arrow2: true,
  },
};
export function getQuiverAILanguageModelEntry(modelId: string) {
  const known = quiveraiLanguageModelIds.some(id => id === modelId);
  return {
    capabilities: {
      language: {
        inputs: { image: 'unknown', audio: 'unknown' },
        objectGeneration: false,
        tools: { usage: true, streaming: true },
        reasoning: {
          support: true,
          efforts: quiveraiRequestDefaults.language.reasoningEfforts,
        },
        sampling: {
          temperature: 'unknown',
          topP: 'unknown',
          logprobs: 'unknown',
        },
      },
    },
    providerOptions: {
      language: {
        reasoningEffort: known ? true : 'unknown',
        reasoningSummary: known ? true : 'unknown',
      },
    },
    requestConfig: { language: quiveraiRequestDefaults.language },
  } as const satisfies ModelEntry<{
    language: typeof quiveraiRequestDefaults.language;
  }>;
}
export function getQuiverAIImageModelEntry(modelId: string) {
  const known = quiveraiImageModelIds.some(id => id === modelId);
  const policy = imagePolicies[modelId];
  const arrow2 = policy?.arrow2 ?? false;
  const image = {
    sizes: {
      description:
        'SVG canvas dimensions are set through attributes; size and aspectRatio are ignored.',
    },
    fileInput: known ? true : 'unknown',
    maskInput: known ? false : 'unknown',
    maxImagesPerCall: quiveraiRequestDefaults.image.maxImagesPerCall,
    animation: arrow2,
    editing: arrow2
      ? {
          condition:
            "Requires the API key's model inventory to include the svg_edit operation.",
        }
      : false,
  } as const;
  return {
    capabilities: { image },
    providerOptions: {
      image: {
        ...Object.fromEntries(
          Object.keys(quiveraiProviderOptions.image).map(
            key => [key, known ? true : 'unknown'] as const,
          ),
        ),
        operation: {
          condition:
            'Generate and vectorize use image models; animate and edit require Arrow 2 or Arrow 2 Telos.',
        },
        instructions: { condition: 'Generate only.' },
        attributes: { condition: 'Generate and vectorize only.' },
        topP: { condition: 'Generate and vectorize only.' },
        presencePenalty: { condition: 'Generate and vectorize only.' },
        autoCrop: { condition: 'Vectorize only.' },
        targetSize: { condition: 'Vectorize only.' },
        referenceImages: arrow2
          ? {
              condition: 'Edit only, with SVG editing enabled for the API key.',
            }
          : false,
        maxReviewSteps: arrow2
          ? {
              condition: 'Edit only, with SVG editing enabled for the API key.',
            }
          : false,
        orchestratorMaxOutputTokens: arrow2
          ? {
              condition: 'Edit only, with SVG editing enabled for the API key.',
            }
          : false,
        shallowMaxOutputTokens: arrow2
          ? {
              condition: 'Edit only, with SVG editing enabled for the API key.',
            }
          : false,
      },
    },
    requestConfig: {
      image: {
        generateReferenceLimit: policy?.generateReferenceLimit ?? 16,
        maxOutputTokens: policy?.maxOutputTokens,
        editModel: arrow2,
      },
    },
  } as const satisfies ModelEntry<{
    image: {
      generateReferenceLimit: number;
      maxOutputTokens: number | undefined;
      editModel: boolean;
    };
  }>;
}

export const quiveraiModelCatalog: Record<
  string,
  ModelEntry<Record<string, unknown>>
> = {};
for (const id of quiveraiLanguageModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getQuiverAILanguageModelEntry(id);
  const previous = quiveraiModelCatalog[id];
  quiveraiModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}
for (const id of quiveraiImageModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getQuiverAIImageModelEntry(id);
  const previous = quiveraiModelCatalog[id];
  quiveraiModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}

/** Known model IDs, derived from the declarations used to build the catalog. */
export type QuiverAIModelIds = {
  language: (typeof quiveraiLanguageModelIds)[number];
  image: (typeof quiveraiImageModelIds)[number];
};
