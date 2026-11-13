export const anthropicAwsDocs = {
  catalogPath: 'packages/anthropic-aws/src/anthropic-aws-model-catalog.ts',
  catalogExport: 'anthropicAwsModelCatalog',
  providerOptionsExport: 'anthropicAwsProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/07-anthropic-aws.mdx',
  tables: [
    {
      id: 'anthropic-aws-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
        ['Computer Use', 'tools.computerUse'],
        ['Web Search', 'tools.webSearch'],
        ['Tool Search', 'tools.toolSearch'],
        ['Compaction', 'compaction'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'anthropic-aws-provider-options' }],
};
