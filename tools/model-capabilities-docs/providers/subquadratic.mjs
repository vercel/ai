export const subquadraticDocs = {
  catalogPath: 'packages/subquadratic/src/subquadratic-model-catalog.ts',
  catalogExport: 'subquadraticModelCatalog',
  providerOptionsExport: 'subquadraticProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/280-subquadratic.mdx',
  tables: [
    {
      id: 'subquadratic-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
        ['JSON Schema', 'structuredOutput.jsonSchema'],
        ['Reasoning', 'reasoning.support'],
        ['Reasoning Efforts', 'reasoning.efforts', v => v.join(', ')],
        ['Temperature', 'sampling.temperature'],
      ],
    },
    {
      id: 'subquadratic-decision',
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
  providerOptionTables: [{ id: 'subquadratic-provider-options' }],
};
