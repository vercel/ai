export const liquidDocs = {
  catalogPath: 'packages/liquid/src/liquid-model-catalog.ts',
  catalogExport: 'liquidModelCatalog',
  docsPath: 'content/providers/01-ai-sdk-providers/270-liquid.mdx',
  tables: [
    {
      id: 'liquid-decision',
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
