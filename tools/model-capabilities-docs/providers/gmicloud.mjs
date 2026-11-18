export const gmicloudDocs = {
  catalogPath: 'packages/gmicloud/src/gmicloud-model-catalog.ts',
  catalogExport: 'gmicloudModelCatalog',
  providerOptionsExport: 'gmicloudProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/100-gmicloud.mdx',
  tables: [
    {
      id: 'gmicloud-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'gmicloud-provider-options' }],
};
