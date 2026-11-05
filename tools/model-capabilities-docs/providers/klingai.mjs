export const klingaiDocs = {
  catalogPath: 'packages/klingai/src/klingai-model-catalog.ts',
  catalogExport: 'klingAIModelCatalog',
  providerOptionsExport: 'klingAIProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/85-klingai.mdx',
  tables: [
    {
      id: 'klingai-t2v',
      capability: 'video',
      filter: function anonymous(entry) {
        return entry.requestConfig.video.mode === 't2v';
      },
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
    {
      id: 'klingai-i2v',
      capability: 'video',
      filter: function anonymous(entry) {
        return entry.requestConfig.video.mode === 'i2v';
      },
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
    {
      id: 'klingai-motion-control',
      capability: 'video',
      filter: function anonymous(entry) {
        return entry.requestConfig.video.mode === 'motion-control';
      },
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
  providerOptionTables: [{ id: 'klingai-provider-options' }],
};
