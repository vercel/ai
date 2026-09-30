// Adapted from the prior ai-sdk.dev landing page. These are displayed examples;
// selecting a provider never sends a generation request.
export type Mode = 'gateway' | 'provider' | 'custom';
export type ModelKind = 'text' | 'image' | 'speech' | 'transcription' | 'video';

export const PROVIDERS = [
  { id: 'grok', label: 'Grok' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'meta', label: 'Meta' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'moonshot', label: 'Moonshot' },
  { id: 'zai', label: 'Z.ai' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
] as const;

export type Provider = (typeof PROVIDERS)[number]['id'];

export interface CodeExample {
  label: string;
  filename: string;
  kind: ModelKind;
  getCode: (provider: Provider, mode: Mode) => string;
}

const textModels: Record<Provider, [string, string, string]> = {
  grok: ['xai', 'grok-4.7', 'spacexai/grok-4.7'],
  openai: ['openai', 'gpt-6-astra', 'openai/gpt-6-astra'],
  anthropic: ['anthropic', 'claude-sonnet-5.5', 'anthropic/claude-sonnet-5.5'],
  google: ['google', 'gemini-3.1-pro-preview', 'google/gemini-3.1-pro-preview'],
  mistral: ['mistral', 'mistral-large-3', 'mistral/mistral-large-3'],
  meta: [
    'togetherai',
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'meta/llama-3.3-70b',
  ],
  perplexity: ['perplexity', 'sonar', 'perplexity/sonar'],
  deepseek: ['deepseek', 'deepseek-v4-pro', 'deepseek/deepseek-v4-pro'],
  moonshot: ['moonshotai', 'kimi-k2.6', 'moonshotai/kimi-k2.6'],
  zai: ['zai', 'glm-5.2', 'zai/glm-5.2'],
  elevenlabs: [
    'elevenlabs',
    'eleven_multilingual_v2',
    'elevenlabs/eleven_multilingual_v2',
  ],
};

const providersByKind: Record<ModelKind, Provider[]> = {
  text: PROVIDERS.filter(provider => provider.id !== 'elevenlabs').map(
    provider => provider.id,
  ),
  image: ['grok', 'openai', 'google'],
  speech: ['openai', 'elevenlabs'],
  transcription: ['openai'],
  video: ['grok', 'google'],
};

export function providersFor(kind: ModelKind, mode: Mode): Provider[] {
  // ElevenLabs is available directly; the gateway speech catalog does not
  // advertise an ElevenLabs model.
  return kind === 'speech' && mode === 'gateway'
    ? ['openai']
    : providersByKind[kind];
}

export function resolveProvider(
  kind: ModelKind,
  mode: Mode,
  provider: Provider,
): Provider {
  const allowed = providersFor(kind, mode);
  return allowed.includes(provider) ? provider : allowed[0];
}

function modelConfig(
  kind: ModelKind,
  provider: Provider,
): [string, string, string] {
  if (kind === 'image') {
    if (provider === 'grok')
      return [
        'xai',
        'grok-imagine-image-2.0',
        'spacexai/grok-imagine-image-2.0',
      ];
    if (provider === 'google')
      return [
        'google',
        'gemini-3.1-flash-image-preview',
        'google/gemini-3.1-flash-image',
      ];
    return [
      'openai',
      'gpt-image-2.5-sunburst',
      'openai/gpt-image-2.5-sunburst',
    ];
  }
  if (kind === 'video') {
    return provider === 'grok'
      ? ['xai', 'grok-imagine-video-1.5', 'spacexai/grok-imagine-video-1.5']
      : ['google', 'veo-3.1-generate', 'google/veo-3.1-generate-001'];
  }
  if (kind === 'speech') {
    return provider === 'elevenlabs'
      ? textModels.elevenlabs
      : ['openai', 'tts-1', 'openai/tts-1'];
  }
  if (kind === 'transcription')
    return ['openai', 'whisper-1', 'openai/whisper-1'];
  return textModels[provider];
}

function sample({
  imports,
  body,
  kind,
  provider,
  mode,
  extraImports = '',
}: {
  imports: string;
  body: string;
  kind: ModelKind;
  provider: Provider;
  mode: Mode;
  extraImports?: string;
}) {
  const [sdk, modelId, gatewayId] = modelConfig(
    kind,
    resolveProvider(kind, mode, provider),
  );
  const method = kind === 'text' ? 'languageModel' : kind;
  let model = `'${gatewayId}'`;
  let setup = '';
  let providerImport = '';

  if (mode !== 'gateway') {
    providerImport = `\nimport { ${sdk} } from '@ai-sdk/${sdk}';`;
    model =
      kind === 'text'
        ? `${sdk}('${modelId}')`
        : `${sdk}.${method}('${modelId}')`;
  }
  if (mode === 'custom') {
    imports += ', customProvider';
    const collection = kind === 'text' ? 'languageModels' : `${kind}Models`;
    setup = `const provider = customProvider({\n  ${collection}: { 'my-model': ${model} },\n});\n\n`;
    model = `provider.${kind === 'text' ? 'languageModel' : `${kind}Model`}('my-model')`;
  }
  return `import { ${imports} } from 'ai';${providerImport}${extraImports}\n\n${setup}${body.replaceAll('__MODEL__', model)}`;
}

const example = (
  label: string,
  filename: string,
  kind: ModelKind,
  imports: string,
  body: string,
  extraImports = '',
): CodeExample => ({
  label,
  filename,
  kind,
  getCode: (provider, mode) =>
    sample({ imports, body, kind, provider, mode, extraImports }),
});

export const CORE_EXAMPLES: CodeExample[] = [
  example(
    'Text Generation',
    'generate-text.ts',
    'text',
    'generateText',
    `const { text } = await generateText({
  model: __MODEL__,
  prompt: 'Explain the concept of quantum entanglement.',
});

console.log(text);`,
  ),
  example(
    'Speech',
    'generate-speech.ts',
    'speech',
    'generateSpeech',
    `const { audio } = await generateSpeech({
  model: __MODEL__,
  text: 'You can build and host many different types of applications.',
});

console.log(audio);`,
  ),
  example(
    'Transcription',
    'transcribe.ts',
    'transcription',
    'transcribe',
    `const { text } = await transcribe({
  model: __MODEL__,
  audio: new URL('https://example.com/audio.mp3'),
});

console.log(text);`,
  ),
  example(
    'Image Generation',
    'generate-image.ts',
    'image',
    'generateImage',
    `const { image } = await generateImage({
  model: __MODEL__,
  prompt: 'A teddy bear wearing a black hat hiking in the mountains',
});

console.log(image.base64);`,
  ),
  example(
    'Video Generation',
    'generate-video.ts',
    'video',
    'experimental_generateVideo as generateVideo',
    `const { videos } = await generateVideo({
  model: __MODEL__,
  prompt: 'A hippo chasing a cheetah through New York',
});

console.log(videos[0].base64);`,
  ),
  example(
    'Tool Calling',
    'tool-calling.ts',
    'text',
    'generateText, tool, stepCountIs',
    `const { text } = await generateText({
  model: __MODEL__,
  prompt: 'What is the weather in San Francisco?',
  stopWhen: stepCountIs(2),
  tools: {
    getWeather: tool({
      description: 'Get the weather for a location',
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => ({
        location, temperature: 72, condition: 'sunny',
      }),
    }),
  },
});

console.log(text);`,
    "\nimport { z } from 'zod/v4';",
  ),
  example(
    'Error Handling',
    'error-handling.ts',
    'text',
    'streamText',
    `const result = streamText({
  model: __MODEL__,
  prompt: 'Write a short story.',
});

for await (const part of result.fullStream) {
  if (part.type === 'error') {
    console.error('Stream error:', part.error);
  } else if (part.type === 'text-delta') {
    process.stdout.write(part.text);
  }
}`,
  ),
  {
    label: 'DevTools',
    filename: 'devtools.ts',
    kind: 'text',
    getCode: (provider, mode) => {
      const code = sample({
        imports: 'generateText, wrapLanguageModel',
        kind: 'text',
        provider,
        mode,
        extraImports:
          "\nimport { devToolsMiddleware } from '@ai-sdk/devtools';",
        body: `const model = wrapLanguageModel({
  model: __MODEL__,
  middleware: devToolsMiddleware(),
});

const { text } = await generateText({
  model,
  prompt: 'Why is the sky blue?',
});

console.log(text);`,
      });
      // wrapLanguageModel needs a model instance rather than a gateway ID.
      return mode === 'gateway'
        ? code
            .replace(
              'generateText, wrapLanguageModel',
              'generateText, wrapLanguageModel, gateway',
            )
            .replace(/model: ('[^']+'),/, 'model: gateway($1),')
        : code;
    },
  },
];

export const HERO_EXAMPLES = [
  CORE_EXAMPLES[0],
  CORE_EXAMPLES[3],
  CORE_EXAMPLES[1],
  CORE_EXAMPLES[2],
  CORE_EXAMPLES[4],
];

const CHAT_QUESTION = 'Explain quantum entanglement in simple terms.';

const CHAT_RESPONSES: Record<Provider, string> = {
  openai:
    'Quantum entanglement is when two particles become connected so that the state of one instantly influences the state of the other, regardless of the distance separating them.',
  anthropic:
    'Quantum entanglement is when two particles become linked so that measuring one instantly affects the other, no matter the distance between them.',
  google:
    'Think of two coins that always land on opposite sides. Quantum entanglement is similar — measuring one particle immediately determines the state of its partner, even across vast distances.',
  grok: "Entanglement is nature's way of keeping a secret between two particles. Once entangled, observing one instantly reveals information about the other — no signal needed, no matter how far apart they are.",
  mistral:
    'When two particles are entangled, they share a quantum state. A measurement on one particle instantaneously constrains the possible outcomes for the other, regardless of separation distance.',
  meta: 'Imagine two dice that are magically linked — whenever one rolls a six, the other always rolls a one. Quantum entanglement works similarly, connecting particles so their measurements are always correlated.',
  perplexity:
    "Quantum entanglement occurs when particles interact and become correlated. After separation, measuring one particle's property instantly determines the corresponding property of the other, defying classical expectations about locality.",
  deepseek:
    'Entanglement means two particles share a joint quantum state. When you measure one, the other\'s state is determined simultaneously — a phenomenon Einstein famously called "spooky action at a distance."',
  moonshot:
    "Two entangled particles behave as a single system. No matter how far apart they are, measuring one instantly defines the other's properties — faster than light could travel between them.",
  zai: 'Quantum entanglement links two particles at a fundamental level. Once entangled, a change observed in one is reflected in the other instantaneously, even across the entire universe.',
  elevenlabs:
    'Quantum entanglement is when two particles become linked so that measuring one instantly affects the other, no matter the distance between them.',
};

export function getChatPreview(provider: Provider) {
  return [
    { role: 'user' as const, content: CHAT_QUESTION },
    { role: 'assistant' as const, content: CHAT_RESPONSES[provider] },
  ];
}
