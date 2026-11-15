export const moonshotaiDocs = {
  catalogPath: 'packages/moonshotai/src/moonshotai-model-catalog.ts',
  catalogExport: 'moonshotaiModelCatalog',
  providerOptionsExport: 'moonshotAIProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/31-moonshotai.mdx',
  tables: [
    {
      id: 'moonshotai-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Video Input', 'inputs.video'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'moonshotai-provider-options' }],
};
