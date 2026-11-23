export const prodiaDocs = {
  catalogPath: 'packages/prodia/src/prodia-model-catalog.ts',
  catalogExport: 'prodiaModelCatalog',
  providerOptionsExport: 'prodiaProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/65-prodia.mdx',
  tables: [
    {
      id: 'prodia-image',
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
      id: 'prodia-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
        ['Text Generation', 'textGeneration'],
        ['Image Generation', 'imageGeneration'],
      ],
    },
    {
      id: 'prodia-video',
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
  providerOptionTables: [{ id: 'prodia-provider-options' }],
};
