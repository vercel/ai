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
    {
      id: 'baseten-decision',
      capability: 'decision',
      columns: [
        ['Boolean', 'questionTypes.boolean'],
        ['Choice', 'questionTypes.choice'],
        ['Score', 'questionTypes.score'],
        ['Box', 'questionTypes.box'],
        ['Image Input', 'inputs.image'],
        ['Reasoning', 'reasoning'],
        ['Max Output Tokens', 'maxOutputTokens'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'baseten-provider-options' }],
};
