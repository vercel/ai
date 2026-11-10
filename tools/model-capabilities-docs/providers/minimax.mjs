export const minimaxDocs = {
  catalogPath: 'packages/minimax/src/minimax-model-catalog.ts',
  catalogExport: 'minimaxModelCatalog',
  providerOptionsExport: 'miniMaxProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/33-minimax.mdx',
  tables: [
    {
      id: 'minimax-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
    {
      id: 'minimax-video',
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
  providerOptionTables: [{ id: 'minimax-provider-options' }],
};
