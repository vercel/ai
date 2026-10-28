export type ModelKind =
  | 'text'
  | 'image'
  | 'video'
  | 'speech'
  | 'transcription'
  | 'embedding'
  | 'decision';

/** Default AI Gateway model per kind, shared with the interactive code preview. */
export const DEFAULT_MODEL_IDS: Record<ModelKind, string> = {
  text: 'anthropic/claude-sonnet-5.5',
  image: 'openai/gpt-image-2.5-sunburst',
  video: 'google/veo-3.1-generate-001',
  speech: 'fish-audio/s2.1-pro',
  transcription: 'openai/whisper-1',
  embedding: 'voyage/voyage-4',
  decision: 'typesafe-ai/jev',
};

export const MODEL_KIND_PLACEHOLDERS: Record<ModelKind, string[]> = {
  text: ['__TEXT_MODEL__', '__MODEL__'],
  image: ['__IMAGE_MODEL__'],
  video: ['__VIDEO_MODEL__'],
  speech: ['__SPEECH_MODEL__'],
  transcription: ['__TRANSCRIPTION_MODEL__'],
  embedding: ['__EMBEDDING_MODEL__'],
  decision: ['__DECISION_MODEL__'],
};

const modelPlaceholders: [RegExp, ModelKind][] = [
  [/__TEXT_MODEL__/g, 'text'],
  [/__MODEL__/g, 'text'],
  [/__IMAGE_MODEL__/g, 'image'],
  [/__VIDEO_MODEL__/g, 'video'],
  [/__SPEECH_MODEL__/g, 'speech'],
  [/__TRANSCRIPTION_MODEL__/g, 'transcription'],
  [/__EMBEDDING_MODEL__/g, 'embedding'],
  [/__DECISION_MODEL__/g, 'decision'],
];

const providerImportLine = /^.*__PROVIDER_IMPORT__.*(?:\r?\n|$)/gm;

/**
 * Resolve code-sample placeholders the way the interactive code preview's
 * default AI Gateway tab does, so Markdown responses contain runnable code
 * instead of `__MODEL__` and `__PROVIDER_IMPORT__` tokens.
 */
export const resolveModelPlaceholders = (markdown: string) => {
  let result = markdown
    .replace(providerImportLine, '')
    .replace(/^.*__GATEWAY_OPTIONS__.*(?:\r?\n|$)/gm, '');

  for (const [placeholder, kind] of modelPlaceholders) {
    result = result.replace(placeholder, `'${DEFAULT_MODEL_IDS[kind]}'`);
  }

  return result;
};

/** The model controlled by the example's dropdown. Preserve mixed text/image/video examples. */
export const getCodeTemplateModelKind = (code: string): ModelKind => {
  const kinds: ModelKind[] = [
    'video',
    'image',
    'speech',
    'transcription',
    'embedding',
    'decision',
    'text',
  ];
  return (
    kinds.find(kind =>
      MODEL_KIND_PLACEHOLDERS[kind].some(placeholder =>
        code.includes(placeholder),
      ),
    ) ?? 'text'
  );
};

export const getCodeTemplateDefaults = (
  code: string,
  modelId?: string,
): Record<ModelKind, string> => ({
  ...DEFAULT_MODEL_IDS,
  ...(modelId
    ? {
        [MODEL_KIND_PLACEHOLDERS.text.some(placeholder =>
          code.includes(placeholder),
        )
          ? 'text'
          : getCodeTemplateModelKind(code)]: modelId,
      }
    : {}),
});
