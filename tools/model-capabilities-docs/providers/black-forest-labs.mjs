export const blackForestLabsDocs = {
  catalogPath:
    'packages/black-forest-labs/src/black-forest-labs-model-catalog.ts',
  catalogExport: 'blackForestLabsModelCatalog',
  providerOptionsExport: 'blackForestLabsProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/12-black-forest-labs.mdx',
  tables: [
    {
      id: 'black-forest-labs-image',
      capability: 'image',
      columns: [
        ['Description', 'description', v => v ?? 'Not declared'],
        [
          'Sizes',
          'sizes',
          v => (Array.isArray(v) ? v.join(', ') : v.description),
        ],
        ['Image Editing', 'fileInput'],
        ['Mask Input', 'maskInput'],
        ['Max Images Per Call', 'maxImagesPerCall', v => v ?? 'Not declared'],
      ],
    },
    {
      id: 'black-forest-labs-video',
      capability: 'video',
      columns: [
        ['Description', 'description', v => v ?? 'Not declared'],
        ['Image Input', 'inputs.image'],
        ['First Frame', 'inputs.firstFrame'],
        ['Last Frame', 'inputs.lastFrame'],
        ['Reference Images', 'inputs.referenceImage'],
        ['Reference Video', 'inputs.referenceVideo'],
        ['Audio', 'generateAudio'],
        ['Aspect Ratio', 'aspectRatio'],
        ['Resolution', 'resolution'],
        ['Duration', 'duration'],
        ['FPS', 'fps'],
        ['Seed', 'seed'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'black-forest-labs-provider-options' }],
};
