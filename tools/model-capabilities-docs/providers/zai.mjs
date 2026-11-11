export const zaiDocs = {
  catalogPath: 'packages/zai/src/zai-model-catalog.ts',
  catalogExport: 'zaiModelCatalog',
  providerOptionsExport: 'zaiProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/200-zai.mdx',
  tables: [
    {
      id: 'zai-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'zai-provider-options' }],
};
