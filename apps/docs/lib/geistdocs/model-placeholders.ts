export type ModelKind = 'text' | 'image' | 'video';

/** Default AI Gateway model per kind, shared with the interactive code preview. */
export const DEFAULT_MODEL_IDS: Record<ModelKind, string> = {
  text: 'anthropic/claude-sonnet-5.5',
  image: 'openai/gpt-image-2.5-sunburst',
  video: 'google/veo-3.1-generate-001',
};

export const MODEL_KIND_PLACEHOLDERS: Record<ModelKind, string[]> = {
  text: ['__TEXT_MODEL__', '__MODEL__'],
  image: ['__IMAGE_MODEL__'],
  video: ['__VIDEO_MODEL__'],
};

const modelPlaceholders: [RegExp, ModelKind][] = [
  [/__TEXT_MODEL__/g, 'text'],
  [/__MODEL__/g, 'text'],
  [/__IMAGE_MODEL__/g, 'image'],
  [/__VIDEO_MODEL__/g, 'video'],
];

const providerImportLine = /^.*__PROVIDER_IMPORT__.*(?:\r?\n|$)/gm;

/**
 * Resolve code-sample placeholders the way the interactive code preview's
 * default AI Gateway tab does, so Markdown responses contain runnable code
 * instead of `__MODEL__` and `__PROVIDER_IMPORT__` tokens.
 */
export const resolveModelPlaceholders = (markdown: string) => {
  let result = markdown.replace(providerImportLine, '');

  for (const [placeholder, kind] of modelPlaceholders) {
    result = result.replace(placeholder, `'${DEFAULT_MODEL_IDS[kind]}'`);
  }

  return result;
};
