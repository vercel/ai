export const cartesiaDocs = {
  "catalogPath": "packages/cartesia/src/cartesia-model-catalog.ts",
  "catalogExport": "cartesiaModelCatalog",
  "providerOptionsExport": "cartesiaProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/95-cartesia.mdx",
  "tables": [
    {
      "id": "cartesia-speech",
      "capability": "speech",
      "columns": [
        [
          "Instructions",
          "instructions"
        ]
      ]
    },
    {
      "id": "cartesia-transcription",
      "capability": "transcription",
      "columns": [
        [
          "Transcription",
          "transcription"
        ],
        [
          "Streaming",
          "streaming"
        ],
        [
          "Duration",
          "duration"
        ],
        [
          "Segments",
          "segments"
        ],
        [
          "Language",
          "language"
        ]
      ]
    },
    {
      "id": "cartesia-realtime",
      "capability": "realtime",
      "columns": [
        [
          "Streaming Transcription",
          "transcription"
        ],
        [
          "Turn Detection",
          "turnDetection"
        ]
      ]
    },
    {
      "id": "cartesia-streaming-transcription",
      "capability": "realtime",
      "columns": [
        [
          "Streaming Transcription",
          "transcription"
        ],
        [
          "Turn Detection",
          "turnDetection"
        ],
        [
          "Keyterms",
          "keyterms"
        ]
      ]
    }
  ],
  "providerOptionTables": [
    {
      "id": "cartesia-provider-options"
    }
  ]
};
