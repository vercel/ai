export const basetenDocs = {
  catalogPath: 'packages/baseten/src/baseten-model-catalog.ts',
  catalogExport: 'basetenModelCatalog',
  providerOptionsExport: 'basetenProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/170-baseten.mdx',
  tables: [
    {
      id: 'baseten-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
        ['JSON Schema', 'structuredOutput.jsonSchema'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'baseten-provider-options' }],
};
