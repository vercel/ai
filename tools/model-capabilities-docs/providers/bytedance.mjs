export const bytedanceDocs = {
  catalogPath: 'packages/bytedance/src/bytedance-model-catalog.ts',
  catalogExport: 'byteDanceModelCatalog',
  providerOptionsExport: 'byteDanceProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/85-bytedance.mdx',
  tables: [
    {
      id: 'bytedance-image',
      capability: 'image',
      columns: [
        ['Name', 'name', v => v ?? 'Not declared'],
        ['Capabilities', 'description', v => v ?? 'Not declared'],
        ['Image Editing', 'fileInput'],
        ['Mask Input', 'maskInput'],
        ['Max Images Per Call', 'maxImagesPerCall', v => v ?? 'Not declared'],
      ],
    },
    {
      id: 'bytedance-video',
      capability: 'video',
      columns: [
        ['Name', 'name', v => v ?? 'Not declared'],
        ['Capabilities', 'description', v => v ?? 'Not declared'],
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
  providerOptionTables: [{ id: 'bytedance-provider-options' }],
};
