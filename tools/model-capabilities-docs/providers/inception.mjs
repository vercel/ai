export const inceptionDocs = {
  catalogPath: 'packages/inception/src/inception-model-catalog.ts',
  catalogExport: 'inceptionModelCatalog',
  docsPath: 'content/providers/01-ai-sdk-providers/250-inception.mdx',
  tables: [
    {
      id: 'inception-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
        ['Reasoning', 'reasoning.support'],
      ],
    },
  ],
};
