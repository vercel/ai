export const replicateDocs = {
  catalogPath: 'packages/replicate/src/replicate-model-catalog.ts',
  catalogExport: 'replicateModelCatalog',
  providerOptionsExport: 'replicateProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/60-replicate.mdx',
  tables: [
    {
      id: 'replicate-image',
      capability: 'image',
      columns: [
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
      id: 'replicate-video',
      capability: 'video',
      columns: [
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
  providerOptionTables: [{ id: 'replicate-provider-options' }],
};
