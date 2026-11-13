export const quiveraiDocs = {
  "catalogPath": "packages/quiverai/src/quiverai-model-catalog.ts",
  "catalogExport": "quiveraiModelCatalog",
  "providerOptionsExport": "quiveraiProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/180-quiverai.mdx",
  "tables": [
    {
      "id": "quiverai-language",
      "capability": "language",
      "columns": [
        [
          "Object Generation",
          "objectGeneration"
        ],
        [
          "Tool Usage",
          "tools.usage"
        ],
        [
          "Tool Streaming",
          "tools.streaming"
        ],
        [
          "Reasoning",
          "reasoning.support"
        ]
      ]
    },
    {
      "id": "quiverai-image",
      "capability": "image",
      "columns": [
        [
          "Image Input",
          "fileInput"
        ],
        [
          "Mask Input",
          "maskInput"
        ],
        [
          "Animation",
          "animation"
        ],
        [
          "SVG Editing",
          "editing"
        ]
      ]
    }
  ],
  "providerOptionTables": [
    {
      "id": "quiverai-provider-options"
    }
  ]
};
