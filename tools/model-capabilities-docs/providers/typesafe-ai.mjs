export const typeSafeAiDocs = {
  "catalogPath": "packages/typesafe-ai/src/typesafe-ai-model-catalog.ts",
  "catalogExport": "typeSafeAiModelCatalog",
  "providerOptionsExport": "typeSafeAiProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/105-typesafe-ai.mdx",
  "tables": [
    {
      "id": "typesafe-ai-models",
      "capability": "decision",
      "columns": [
        [
          "Description",
          "description", String
        ]
      ]
    },
    {
      "id": "typesafe-ai-decision",
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
      "id": "typesafe-ai-provider-options"
    }
  ]
};
