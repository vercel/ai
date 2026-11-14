export const heygenDocs = {
  catalogPath: 'packages/heygen/src/heygen-model-catalog.ts',
  catalogExport: 'heyGenModelCatalog',
  providerOptionsExport: 'heyGenProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/220-heygen.mdx',
  tables: [
    {
      id: 'heygen-video',
      capability: 'video',
      columns: [
        ['Image Input', 'inputs.image'],
        ['First Frame', 'inputs.firstFrame'],
        ['Last Frame', 'inputs.lastFrame'],
        ['Reference Images', 'inputs.referenceImage'],
        ['Reference Video', 'inputs.referenceVideo'],
        ['Audio', 'generateAudio'],
        ['Aspect Ratio', 'aspectRatio'],
        ['Resolution', 'resolution'],
        ['Duration', 'duration'],
        ['FPS', 'fps'],
        ['Seed', 'seed'],
      ],
    },
    {
      id: 'heygen-decision',
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
  providerOptionTables: [{ id: 'heygen-provider-options' }],
};
