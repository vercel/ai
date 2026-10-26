import type { ModelKind } from './geistdocs/model-placeholders.ts';

type ProviderCodeConfig = {
  title: string;
  pkg: string;
  export: string;
  kinds: ModelKind[];
  creator?: string;
  /** Explicit pairs for hosted models, aliases, and deployment names. */
  models?: Record<string, string>;
  importCode?: string;
  /** Gateway endpoint slug, which can differ from the SDK package name. */
  gatewayProvider?: string;
};

// Scope provider-page dropdowns to models with a known direct-provider mapping.
// Providers serving other creators' models cannot be filtered by owned_by alone.
export const providerCodeConfigs: Record<string, ProviderCodeConfig> = {
  xai: {
    title: 'xAI',
    pkg: 'xai',
    export: 'xai',
    kinds: ['text'],
    models: {
      'spacexai/grok-4.20-non-reasoning': 'grok-4.20-non-reasoning',
      'spacexai/grok-4.20-reasoning': 'grok-4.20-reasoning',
      'spacexai/grok-4.3': 'grok-4.3',
      'spacexai/grok-4.5': 'grok-4.5',
      'spacexai/grok-4.6': 'grok-4.6',
      'spacexai/grok-4.7': 'grok-4.7',
    },
  },
  openai: {
    title: 'OpenAI',
    pkg: 'openai',
    export: 'openai',
    kinds: ['text'],
    models: {
      'openai/gpt-3.5-turbo': 'gpt-3.5-turbo',
      'openai/gpt-4.1': 'gpt-4.1',
      'openai/gpt-4.1-mini': 'gpt-4.1-mini',
      'openai/gpt-4.1-nano': 'gpt-4.1-nano',
      'openai/gpt-4o': 'gpt-4o',
      'openai/gpt-4o-mini': 'gpt-4o-mini',
      'openai/gpt-5': 'gpt-5',
      'openai/gpt-5-codex': 'gpt-5-codex',
      'openai/gpt-5-mini': 'gpt-5-mini',
      'openai/gpt-5-nano': 'gpt-5-nano',
      'openai/gpt-5-pro': 'gpt-5-pro',
      'openai/gpt-5.1-codex': 'gpt-5.1-codex',
      'openai/gpt-5.1-codex-max': 'gpt-5.1-codex-max',
      'openai/gpt-5.1-codex-mini': 'gpt-5.1-codex-mini',
      'openai/gpt-5.2': 'gpt-5.2',
      'openai/gpt-5.2-codex': 'gpt-5.2-codex',
      'openai/gpt-5.2-pro': 'gpt-5.2-pro',
      'openai/gpt-5.3-codex': 'gpt-5.3-codex',
      'openai/gpt-5.4': 'gpt-5.4',
      'openai/gpt-5.4-mini': 'gpt-5.4-mini',
      'openai/gpt-5.4-nano': 'gpt-5.4-nano',
      'openai/gpt-5.4-pro': 'gpt-5.4-pro',
      'openai/gpt-5.5': 'gpt-5.5',
      'openai/gpt-5.6-luna': 'gpt-5.6-luna',
      'openai/gpt-5.6-sol': 'gpt-5.6-sol',
      'openai/gpt-5.6-terra': 'gpt-5.6-terra',
      'openai/gpt-6-astra': 'gpt-6-astra',
      'openai/gpt-6-luna': 'gpt-6-luna',
      'openai/gpt-6-sol': 'gpt-6-sol',
      'openai/gpt-6.1-sol': 'gpt-6.1-sol',
      'openai/o1': 'o1',
      'openai/o3': 'o3',
      'openai/o3-mini': 'o3-mini',
      'openai/o4-mini': 'o4-mini',
    },
  },
  azure: {
    title: 'Azure OpenAI',
    pkg: 'azure',
    export: 'azure',
    gatewayProvider: 'azure',
    kinds: ['text'],
    models: {
      'openai/gpt-6-astra': 'your-gpt-6-astra-deployment-name',
    },
  },
  anthropic: {
    title: 'Anthropic',
    pkg: 'anthropic',
    export: 'anthropic',
    kinds: ['text'],
    models: {
      'anthropic/claude-fable-5': 'claude-fable-5',
      'anthropic/claude-fable-5.1': 'claude-fable-5-1',
      'anthropic/claude-haiku-4.5': 'claude-haiku-4-5',
      'anthropic/claude-haiku-5.5': 'claude-haiku-5-5',
      'anthropic/claude-opus-4.5': 'claude-opus-4-5',
      'anthropic/claude-opus-4.6': 'claude-opus-4-6',
      'anthropic/claude-opus-4.7': 'claude-opus-4-7',
      'anthropic/claude-opus-4.8': 'claude-opus-4-8',
      'anthropic/claude-opus-5': 'claude-opus-5',
      'anthropic/claude-opus-5.5': 'claude-opus-5-5',
      'anthropic/claude-sonnet-4.5': 'claude-sonnet-4-5',
      'anthropic/claude-sonnet-4.6': 'claude-sonnet-4-6',
      'anthropic/claude-sonnet-5': 'claude-sonnet-5',
      'anthropic/claude-sonnet-5.5': 'claude-sonnet-5-5',
    },
  },
  'open-responses': {
    title: 'Open Responses',
    pkg: 'open-responses',
    export: 'openResponses',
    kinds: ['text'],
    models: {
      'openai/gpt-6-astra': 'your-model-id',
    },
    importCode:
      "import { createOpenResponses } from '@ai-sdk/open-responses';\n\nconst openResponses = createOpenResponses({\n  name: 'custom',\n  url: process.env.OPEN_RESPONSES_URL!,\n  apiKey: process.env.OPEN_RESPONSES_API_KEY,\n})",
  },
  'anthropic-aws': {
    title: 'Claude Platform on AWS',
    pkg: 'anthropic-aws',
    export: 'anthropicAws',
    gatewayProvider: 'claudeaws',
    kinds: ['text'],
    models: {
      'anthropic/claude-sonnet-5.5': 'claude-sonnet-5-5',
      'anthropic/claude-haiku-5.5': 'claude-haiku-5-5',
      'anthropic/claude-opus-5.5': 'claude-opus-5-5',
    },
  },
  amazon: {
    title: 'Amazon Bedrock',
    pkg: 'amazon-bedrock',
    export: 'amazonBedrock',
    gatewayProvider: 'bedrock',
    kinds: ['text'],
    models: {
      'amazon/nova-pro': 'us.amazon.nova-pro-v1:0',
      'amazon/nova-lite': 'us.amazon.nova-lite-v1:0',
      'amazon/nova-micro': 'us.amazon.nova-micro-v1:0',
      'anthropic/claude-sonnet-5.5': 'anthropic.claude-sonnet-5-5',
    },
  },
  groq: {
    title: 'Groq',
    pkg: 'groq',
    export: 'groq',
    gatewayProvider: 'groq',
    kinds: ['text'],
    models: {
      'openai/gpt-oss-120b': 'openai/gpt-oss-120b',
      'openai/gpt-oss-20b': 'openai/gpt-oss-20b',
    },
  },
  fal: {
    title: 'Fal',
    pkg: 'fal',
    export: 'fal',
    kinds: ['image'],
    models: {
      'bfl/flux-pro-1.1': 'fal-ai/flux-pro/v1.1',
      'bfl/flux-pro-1.1-ultra': 'fal-ai/flux-pro/v1.1-ultra',
      'bfl/flux-kontext-pro': 'fal-ai/flux-pro/kontext',
    },
  },
  gmicloud: {
    title: 'GMI Cloud',
    pkg: 'gmicloud',
    export: 'gmicloud',
    gatewayProvider: 'gmicloud',
    kinds: ['text'],
    models: {
      'deepseek/deepseek-v4-flash-0731': 'deepseek-ai/DeepSeek-V4-Flash-0731',
      'minimax/minimax-m3': 'MiniMaxAI/MiniMax-M3',
    },
  },
  'typesafe-ai': {
    title: 'TypeSafe',
    pkg: 'typesafe-ai',
    export: 'typeSafeAi',
    kinds: ['decision'],
    models: {
      'typesafe-ai/jev': 'jev-latest',
    },
  },
  deepinfra: {
    title: 'DeepInfra',
    pkg: 'deepinfra',
    export: 'deepInfra',
    gatewayProvider: 'deepinfra',
    kinds: ['text'],
    models: {
      'meta/llama-4-scout': 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
      'openai/gpt-oss-20b': 'openai/gpt-oss-20b',
    },
  },
  bfl: {
    title: 'Black Forest Labs',
    pkg: 'black-forest-labs',
    export: 'blackForestLabs',
    kinds: ['image'],
    models: {
      'bfl/flux-2-flex': 'flux-2-flex',
      'bfl/flux-2-klein-4b': 'flux-2-klein-4b',
      'bfl/flux-2-klein-9b': 'flux-2-klein-9b',
      'bfl/flux-2-max': 'flux-2-max',
      'bfl/flux-2-pro': 'flux-2-pro',
      'bfl/flux-3-image': 'flux-3-image',
      'bfl/flux-kontext-max': 'flux-kontext-max',
      'bfl/flux-kontext-pro': 'flux-kontext-pro',
      'bfl/flux-pro-1.1': 'flux-pro-1.1',
      'bfl/flux-pro-1.1-ultra': 'flux-pro-1.1-ultra',
    },
  },
  'google-vertex': {
    title: 'Google Vertex AI',
    pkg: 'google-vertex',
    export: 'googleVertex',
    gatewayProvider: 'vertex',
    kinds: ['text'],
    models: {
      'google/gemini-4-argon': 'gemini-4-argon',
      'google/gemini-3.8-flash': 'gemini-3.8-flash',
      'google/gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
    },
  },
  baseten: {
    title: 'Baseten',
    pkg: 'baseten',
    export: 'baseten',
    gatewayProvider: 'baseten',
    kinds: ['text'],
    models: {
      'openai/gpt-oss-120b': 'openai/gpt-oss-120b',
    },
  },
  huggingface: {
    title: 'Hugging Face',
    pkg: 'huggingface',
    export: 'huggingFace',
    kinds: ['text'],
    models: {
      'meta/llama-3.3-70b': 'meta-llama/Llama-3.3-70B-Instruct',
    },
  },
  quiverai: {
    title: 'QuiverAI',
    pkg: 'quiverai',
    export: 'quiverai',
    kinds: ['text'],
    models: {
      'quiverai/arrow-2': 'arrow-2',
      'quiverai/arrow-2-telos': 'arrow-2-telos',
    },
  },
  'fish-audio': {
    title: 'Fish Audio',
    pkg: 'fish-audio',
    export: 'fishAudio',
    kinds: ['speech'],
    creator: 'fish-audio',
  },
  mistral: {
    title: 'Mistral AI',
    pkg: 'mistral',
    export: 'mistral',
    kinds: ['text'],
    models: {
      'mistral/mistral-medium-3.5': 'mistral-medium-3.5',
      'mistral/mistral-large-4': 'mistral-large-4',
      'mistral/mistral-large-3': 'mistral-large-2512',
      'mistral/ministral-14b': 'ministral-14b-latest',
      'mistral/ministral-8b': 'ministral-8b-latest',
      'mistral/ministral-3b': 'ministral-3b-latest',
      'mistral/codestral': 'codestral-latest',
      'mistral/mistral-small': 'mistral-small-latest',
    },
  },
  zai: {
    title: 'Z.AI',
    pkg: 'zai',
    export: 'zai',
    kinds: ['text'],
    models: {
      'zai/glm-5.3': 'glm-5.3',
      'zai/glm-5.2': 'glm-5.2',
      'zai/glm-4.7': 'glm-4.7',
    },
  },
  topaz: {
    title: 'Topaz Labs',
    pkg: 'topaz',
    export: 'topaz',
    kinds: ['image'],
    models: {
      'topaz/wonder-3.5': 'wonder-3.5',
    },
  },
  heygen: {
    title: 'HeyGen',
    pkg: 'heygen',
    export: 'heygen',
    kinds: ['video'],
    models: {
      'heygen/heygen-video-1': 'heygen-video-1',
    },
  },
  togetherai: {
    title: 'Together.ai',
    pkg: 'togetherai',
    export: 'togetherai',
    gatewayProvider: 'togetherai',
    kinds: ['text'],
    models: {
      'deepseek/deepseek-v4-flash-0731': 'deepseek-ai/DeepSeek-V4-Flash-0731',
    },
  },
  cohere: {
    title: 'Cohere',
    pkg: 'cohere',
    export: 'cohere',
    kinds: ['text'],
    models: {
      'cohere/command-a': 'command-a-03-2025',
    },
  },
  fireworks: {
    title: 'Fireworks',
    pkg: 'fireworks',
    export: 'fireworks',
    gatewayProvider: 'fireworks',
    kinds: ['text'],
    models: {
      'openai/gpt-oss-120b': 'accounts/fireworks/models/gpt-oss-120b',
    },
  },
  voyage: {
    title: 'Voyage AI',
    pkg: 'voyage',
    export: 'voyage',
    kinds: ['embedding'],
    creator: 'voyage',
  },
  deepseek: {
    title: 'DeepSeek',
    pkg: 'deepseek',
    export: 'deepSeek',
    kinds: ['text'],
    models: {
      'deepseek/deepseek-v4-flash': 'deepseek-v4-flash',
      'deepseek/deepseek-v4-pro': 'deepseek-v4-pro',
      'deepseek/deepseek-v3.2': 'deepseek-v3.2',
    },
  },
  moonshotai: {
    title: 'Moonshot AI',
    pkg: 'moonshotai',
    export: 'moonshotai',
    kinds: ['text'],
    models: {
      'moonshotai/kimi-k3': 'kimi-k3',
      'moonshotai/kimi-k2.6': 'kimi-k2.6',
    },
  },
  alibaba: {
    title: 'Alibaba',
    pkg: 'alibaba',
    export: 'alibaba',
    kinds: ['text'],
    models: {
      'alibaba/qwen3.7-max': 'qwen3.7-max',
      'alibaba/qwen3-coder': 'qwen3-coder-plus',
      'alibaba/qwen-3-32b': 'qwen3-32b',
      'alibaba/qwen-3-14b': 'qwen3-14b',
    },
  },
  minimax: {
    title: 'MiniMax',
    pkg: 'minimax',
    export: 'minimax',
    kinds: ['text'],
    models: {
      'minimax/minimax-m3': 'minimax-m3',
      'minimax/minimax-m2.7': 'MiniMax-M2.7',
    },
  },
  cerebras: {
    title: 'Cerebras',
    pkg: 'cerebras',
    export: 'cerebras',
    gatewayProvider: 'cerebras',
    kinds: ['text'],
    models: {
      'openai/gpt-oss-120b': 'gpt-oss-120b',
    },
  },
  replicate: {
    title: 'Replicate',
    pkg: 'replicate',
    export: 'replicate',
    kinds: ['image'],
    models: {
      'bfl/flux-2-pro': 'black-forest-labs/flux-2-pro',
      'bfl/flux-pro-1.1': 'black-forest-labs/flux-1.1-pro',
      'bfl/flux-pro-1.1-ultra': 'black-forest-labs/flux-1.1-pro-ultra',
    },
  },
  prodia: {
    title: 'Prodia',
    pkg: 'prodia',
    export: 'prodia',
    kinds: ['image'],
    models: {
      'prodia/flux-fast-schnell': 'inference.flux-fast.schnell.txt2img.v2',
    },
  },
  perplexity: {
    title: 'Perplexity',
    pkg: 'perplexity',
    export: 'perplexity',
    kinds: ['text'],
    models: {
      'perplexity/sonar': 'perplexity/sonar',
    },
  },
  bytedance: {
    title: 'ByteDance',
    pkg: 'bytedance',
    export: 'byteDance',
    kinds: ['image'],
    models: {
      'bytedance/seedream-5.0-pro': 'dola-seedream-5-0-pro-260628',
      'bytedance/seedream-4.5': 'seedream-4-5-251128',
      'bytedance/seedream-4.0': 'seedream-4-0-250828',
    },
  },
  klingai: {
    title: 'Kling AI',
    pkg: 'klingai',
    export: 'klingai',
    kinds: ['video'],
    models: {
      'klingai/kling-v3.0-t2v': 'kling-v3.0-t2v',
      'klingai/kling-v2.6-t2v': 'kling-v2.6-t2v',
      'klingai/kling-v2.5-turbo-t2v': 'kling-v2.5-turbo-t2v',
    },
  },
  google: {
    title: 'Google',
    pkg: 'google',
    export: 'google',
    kinds: ['text', 'image', 'video'],
    creator: 'google',
  },
};

export const isScopedProviderModel = (
  provider: string,
  model: { id: string; provider: string; kind: ModelKind },
): boolean => {
  const config = providerCodeConfigs[provider];
  if (!config || !config.kinds.includes(model.kind)) return false;
  return config.models
    ? Object.hasOwn(config.models, model.id)
    : model.provider === config.creator;
};

export const providerModelCode = (
  provider: string,
  modelId: string,
): string => {
  const config = providerCodeConfigs[provider];
  const mapped = config?.models?.[modelId];
  if (mapped) return mapped;
  const code = modelId.slice(modelId.indexOf('/') + 1);
  if (provider === 'anthropic') return code.replaceAll('.', '-');
  if (modelId === 'google/gemini-3-pro-image')
    return 'gemini-3-pro-image-preview';
  return code;
};

export const providerImport = (provider: string): string => {
  const config = providerCodeConfigs[provider];
  return (
    config?.importCode ??
    `import { ${config?.export ?? provider} } from "@ai-sdk/${config?.pkg ?? provider}"`
  );
};

export const providerModelExpression = (
  provider: string,
  modelId: string,
  suffix: string,
): string => {
  const config = providerCodeConfigs[provider];
  return `${config?.export ?? provider}${suffix}("${providerModelCode(provider, modelId)}")`;
};

/** Include routing preferences only in the Gateway tab and Markdown export. */
export const resolveGatewayOptions = (
  code: string,
  provider?: string,
): string => {
  const slug = provider
    ? providerCodeConfigs[provider]?.gatewayProvider
    : undefined;
  return code.replace(
    /^([ \t]*)__GATEWAY_OPTIONS__[,;]?[ \t]*(?:\r?\n|$)/gm,
    (_, indent: string) =>
      slug
        ? `${indent}providerOptions: {\n${indent}  gateway: {\n${indent}    order: ['${slug}'],\n${indent}  },\n${indent}},\n`
        : '',
  );
};
