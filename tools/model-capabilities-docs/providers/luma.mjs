export const lumaDocs = {
  catalogPath: 'packages/luma/src/luma-model-catalog.ts',
  catalogExport: 'lumaModelCatalog',
  providerOptionsExport: 'lumaProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/80-luma.mdx',
  tables: [
    {
      id: 'luma-image',
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
  ],
  providerOptionTables: [{ id: 'luma-provider-options' }],
};
