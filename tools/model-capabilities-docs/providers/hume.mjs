export const humeDocs = {
  catalogPath: 'packages/hume/src/hume-model-catalog.ts',
  catalogExport: 'humeModelCatalog',
  docsPath: 'content/providers/01-ai-sdk-providers/150-hume.mdx',
  tables: [
    {
      id: 'hume-decision',
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
};
