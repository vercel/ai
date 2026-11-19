import type { ParsedTencentVideoModelId } from './tencent-video-settings';
import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { TencentLanguageModelChatOptions } from './tencent-chat-language-model-options';
import type { TencentVideoModelOptions } from './tencent-video-model-options';

export const tencentProviderOptions = {
  language: {
    user: {
      description:
        'End-user identifier forwarded by the OpenAI-compatible chat adapter.',
    },
    reasoningEffort: {
      description: 'Reasoning effort; support depends on the hosted model.',
    },
    textVerbosity: {
      description: 'Text verbosity; support depends on the hosted model.',
    },
    strictJsonSchema: {
      description:
        'Strict response schema validation when supported by the hosted model.',
    },
  } satisfies Record<
    keyof TencentLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
  video: {
    resolution: {
      description:
        'Output resolution tier, sent as-is. Takes precedence over the top-level `resolution`. TokenHub Kling: `720p`, `1080p`, `4k`. VOD: e.g. `720P`, `1080P`, `2K`, `4K` depending on the model. Both backends.',
    },
    audio: {
      description:
        'TokenHub Kling: audio track mode. `native` generates audio, `original` keeps the audio of a reference video (omni and motion control), `off` disables audio. Takes precedence over the top-level `generateAudio`.',
    },
    multiShot: {
      description:
        'TokenHub Kling: whether a multi-shot prompt produces multi-shot output. Supported by `kling-video-v3` and `kling-video-v3-omni`.',
    },
    characterOrientation: {
      description:
        'TokenHub Kling motion control: whether the character orientation follows the image reference or the motion reference video. Required by the API for motion control models.',
    },
    elements: {
      description:
        'TokenHub Kling: custom elements (subjects) created through the TokenHub element API. `id` is required by motion control models and lets the prompt reference the element.',
    },
    voices: {
      description:
        'TokenHub Kling omni: voices to use, referenced in the prompt as `@id`.',
    },
    referenceVideoType: {
      description:
        'How reference videos from `inputReferences` are used. `feature` uses them as a feature reference, `base` as a video to edit. Defaults to `feature`. TokenHub Kling omni and VOD Kling.',
    },
    watermark: {
      description:
        'Whether to add a watermark (TokenHub `watermark_info`, VOD `LogoAdd`). Both backends.',
    },
    externalTaskId: {
      description: 'TokenHub Kling: custom task ID, unique within the account.',
    },
    negativePrompt: {
      description: 'VOD: prompt describing what the model should avoid.',
    },
    enhancePrompt: {
      description: 'VOD: whether to optimize the prompt automatically.',
    },
    inputRegion: {
      description:
        'VOD: where input files are stored. Tencent defaults to `Mainland`.',
    },
    sceneType: {
      description:
        'VOD: scenario type, e.g. `motion_control`, `avatar_i2v` or `lip_sync` for Kling.',
    },
    personGeneration: {
      description: 'VOD: whether people and faces may be generated.',
    },
    inputComplianceCheck: {
      description: 'VOD: whether to run a compliance check on the input.',
    },
    outputComplianceCheck: {
      description: 'VOD: whether to run a compliance check on the output.',
    },
    enhanceSwitch: {
      description:
        'VOD: whether to upscale output with video enhancement. Tencent enables enhancement by default when the resolution exceeds what the model renders natively.',
    },
    offPeak: { description: 'VOD: whether to run the task in off-peak mode.' },
    sessionId: {
      description:
        'VOD: deduplication identifier. A request that repeats an identifier used within the last three days fails.',
    },
    sessionContext: {
      description: 'VOD: context string passed through to callbacks.',
    },
    tasksPriority: { description: 'VOD: task priority from -10 to 10.' },
    extInfo: {
      description:
        'VOD: reserved field for model-specific parameters, sent as-is.',
    },
    assets: {
      description:
        'VOD: materials registered with `CreateAigcMaterial`, referenced by their `asset://` URL. VOD requires assets for images that show real people. Sent after the other file inputs.',
    },
  } satisfies Record<keyof TencentVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

export const tencentLanguageModelIds = [
  'hy4',
  'hy4-preview',
  'hy3',
  'hy-mt2-pro',
  'hy-mt2-plus',
  'hy-mt2-lite',
  'deepseek-v4-pro-0813',
  'deepseek-v4.1-flash',
  'glm-5.3',
  'glm-5.3-flash',
  'glm-5.2',
  'mimo-v2.6-pro',
  'mimo-v2.6-flash',
  'step-5-preview',
] as const;
export const tencentVideoModelIds = [
  'kling-video-v4',
  'kling-video-v3',
  'kling-video-v3-turbo',
  'kling-video-v3-omni',
  'kling-video-motion-control-v3.0',
  'kling-video-motion-control-v2.6',
  'vod/VS/2.5',
  'vod/VS/2.0',
  'vod/VS/2.0-fast',
  'vod/VS/2.0-mini',
  'vod/Kling/3.0',
  'vod/Kling/3.0-Omni',
  'vod/Kling/3.0-turbo',
  'vod/Kling/2.6',
  'vod/Hailuo/2.3',
  'vod/Vidu/q3-pro',
] as const;

/** Options that only TokenHub Kling models read. */
export const TOKENHUB_ONLY_OPTIONS = [
  'audio',
  'multiShot',
  'characterOrientation',
  'elements',
  'voices',
  'externalTaskId',
] as const satisfies ReadonlyArray<keyof TencentVideoModelOptions>;

/** Options that only VOD models read. */
export const VOD_ONLY_OPTIONS = [
  'negativePrompt',
  'enhancePrompt',
  'inputRegion',
  'sceneType',
  'personGeneration',
  'inputComplianceCheck',
  'outputComplianceCheck',
  'enhanceSwitch',
  'offPeak',
  'sessionId',
  'sessionContext',
  'tasksPriority',
  'extInfo',
  'assets',
] as const satisfies ReadonlyArray<keyof TencentVideoModelOptions>;

const VOD_MODEL_ID_PREFIX = 'vod/';

export function parseTencentVideoModelId(
  modelId: string,
): ParsedTencentVideoModelId | undefined {
  if (modelId.startsWith(VOD_MODEL_ID_PREFIX)) {
    const rest = modelId.slice(VOD_MODEL_ID_PREFIX.length);
    const separator = rest.indexOf('/');
    if (separator <= 0 || separator === rest.length - 1) {
      return undefined;
    }
    return {
      backend: 'vod',
      modelName: rest.slice(0, separator),
      modelVersion: rest.slice(separator + 1),
    };
  }

  if (modelId.startsWith('kling-video-motion-control-')) {
    return { backend: 'tokenhub', kind: 'motion-control' };
  }

  if (modelId.startsWith('kling-video-')) {
    return {
      backend: 'tokenhub',
      kind: modelId.endsWith('-omni') ? 'omni' : 'standard',
    };
  }

  return undefined;
}

const tokenHubPolicies: Record<
  string,
  { audioAndMultiShot: boolean; omni: boolean }
> = {
  'kling-video-v4': { audioAndMultiShot: false, omni: true },
  'kling-video-v3-turbo': { audioAndMultiShot: false, omni: false },
};
export function getTencentLanguageModelEntry(_modelId: string) {
  const language = {
    inputs: { image: 'unknown', audio: 'unknown' },
    objectGeneration: 'unknown',
    tools: { usage: 'unknown', streaming: 'unknown' },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
    chatCompletions: true,
  } as const;
  return {
    capabilities: { language },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(tencentProviderOptions.language).map(
          key => [key, 'unknown'] as const,
        ),
      ),
    },
  } as const satisfies ModelEntry;
}
export function getTencentVideoModelEntry(modelId: string) {
  const parsed = parseTencentVideoModelId(modelId);
  const vod = parsed?.backend === 'vod';
  const motion =
    parsed?.backend === 'tokenhub' && parsed.kind === 'motion-control';
  const policy = tokenHubPolicies[modelId];
  const audioAndMultiShot = policy?.audioAndMultiShot ?? true;
  const omni =
    parsed?.backend === 'tokenhub' &&
    (parsed.kind === 'omni' || (policy?.omni ?? false));
  const backendSupport = {
    condition: 'Depends on the selected VOD model and scenario.',
  } as const;
  const video = {
    inputs: {
      text: vod ? backendSupport : true,
      image: vod ? backendSupport : true,
      firstFrame: vod ? backendSupport : true,
      lastFrame: vod ? backendSupport : !motion,
      referenceImage: vod ? backendSupport : omni || motion,
      referenceVideo: vod ? backendSupport : omni || motion,
    },
    generateAudio: vod
      ? backendSupport
      : motion
        ? {
            condition:
              'Keeps or removes the original audio from the motion reference video.',
          }
        : audioAndMultiShot,
    aspectRatio: vod
      ? backendSupport
      : motion
        ? false
        : { condition: 'Text-to-video and omni generation only.' },
    resolution: true,
    duration: vod ? backendSupport : !motion,
    fps: false,
    seed: vod,
    maxVideosPerCall: 1,
  } as const;
  return {
    capabilities: { video },
    providerOptions: {
      video: {
        ...Object.fromEntries(
          Object.keys(tencentProviderOptions.video).map(
            key => [key, parsed != null ? true : 'unknown'] as const,
          ),
        ),
        ...Object.fromEntries(
          TOKENHUB_ONLY_OPTIONS.map(key => [key, !vod] as const),
        ),
        ...Object.fromEntries(VOD_ONLY_OPTIONS.map(key => [key, vod] as const)),
        audio: !vod && (motion || audioAndMultiShot),
        multiShot: !vod && !motion && audioAndMultiShot,
        characterOrientation: motion,
        voices: !vod && omni,
        elements: vod
          ? false
          : { condition: 'Image-to-video, omni, or motion control only.' },
        referenceVideoType: vod || omni,
      },
    },
    requestConfig: { video: { parsed, audioAndMultiShot, omni } },
  } as const satisfies ModelEntry<{
    video: {
      parsed: ParsedTencentVideoModelId | undefined;
      audioAndMultiShot: boolean;
      omni: boolean;
    };
  }>;
}

export const tencentModelCatalog: Record<
  string,
  ModelEntry<Record<string, unknown>>
> = {};
for (const id of tencentLanguageModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getTencentLanguageModelEntry(id);
  const previous = tencentModelCatalog[id];
  tencentModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}
for (const id of tencentVideoModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getTencentVideoModelEntry(id);
  const previous = tencentModelCatalog[id];
  tencentModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}

/** Known model IDs, derived from the declarations used to build the catalog. */
export type TencentModelIds = {
  language: (typeof tencentLanguageModelIds)[number];
  video: (typeof tencentVideoModelIds)[number];
};
