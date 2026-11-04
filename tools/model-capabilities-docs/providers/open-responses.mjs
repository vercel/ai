export const openResponsesDocs = {
  catalogPath: 'packages/open-responses/src/open-responses-model-catalog.ts',
  catalogExport: 'openResponsesModelCatalog',
  providerOptionsExport: 'openResponsesProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/06-open-responses.mdx',
  tables: [
    {
      id: 'open-responses-language',
      capability: 'language',
      formatModelId: () => 'configured model',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'open-responses-provider-options' }],
};
