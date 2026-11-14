export const parallelDocs = {
  "catalogPath": "packages/parallel/src/parallel-model-catalog.ts",
  "catalogExport": "parallelModelCatalog",
  "providerOptionsExport": "parallelProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/230-parallel.mdx",
  "tables": [
    {
      "id": "parallel-decision",
      "capability": "decision",
      "columns": [
        [
          "Boolean",
          "questionTypes.boolean"
        ],
        [
          "Choice",
          "questionTypes.choice"
        ],
        [
          "Score",
          "questionTypes.score"
        ],
        [
          "Box",
          "questionTypes.box"
        ],
        [
          "Image Input",
          "inputs.image"
        ],
        [
          "Reasoning",
          "reasoning"
        ],
        [
          "Max Output Tokens",
          "maxOutputTokens"
        ]
      ]
    }
  ],
  "providerOptionTables": [
    {
      "id": "parallel-provider-options"
    }
  ]
};
