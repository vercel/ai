export type OpenAIImageModelId =
  | 'dall-e-3'
  | 'dall-e-2'
  | 'gpt-image-1'
  | 'gpt-image-1-mini'
  | 'gpt-image-1.5'
<<<<<<< HEAD
=======
  | 'gpt-image-2'
  | 'chatgpt-image-latest'
>>>>>>> c71ad14db (Backport: feat(provider/openai): add gpt-image-2 model support (#14682))
  | (string & {});

// https://platform.openai.com/docs/guides/images
export const modelMaxImagesPerCall: Record<OpenAIImageModelId, number> = {
  'dall-e-3': 1,
  'dall-e-2': 10,
  'gpt-image-1': 10,
  'gpt-image-1-mini': 10,
  'gpt-image-1.5': 10,
<<<<<<< HEAD
=======
  'gpt-image-2': 10,
  'chatgpt-image-latest': 10,
>>>>>>> c71ad14db (Backport: feat(provider/openai): add gpt-image-2 model support (#14682))
};

export const hasDefaultResponseFormat = new Set([
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-1.5',
<<<<<<< HEAD
]);
=======
  'gpt-image-1',
  'gpt-image-2',
];

export function hasDefaultResponseFormat(modelId: string): boolean {
  return defaultResponseFormatPrefixes.some(prefix =>
    modelId.startsWith(prefix),
  );
}
>>>>>>> c71ad14db (Backport: feat(provider/openai): add gpt-image-2 model support (#14682))
