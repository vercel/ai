export const elevenLabsDocs = {
  "catalogPath": "packages/elevenlabs/src/elevenlabs-model-catalog.ts",
  "catalogExport": "elevenLabsModelCatalog",
  "providerOptionsExport": "elevenLabsProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/90-elevenlabs.mdx",
  "tables": [
    {
      "id": "elevenlabs-speech",
      "capability": "speech",
      "columns": [
        [
          "Speech",
          "speech"
        ],
        [
          "Streaming Speech",
          "streaming"
        ],
        [
          "Instructions",
          "instructions"
        ]
      ]
    },
    {
      "id": "elevenlabs-transcription",
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
      "id": "elevenlabs-streaming-transcription",
 "filter": entry => entry.capabilities.transcription?.streaming === true,
      "capability": "transcription",
      "columns": [
        [
          "Streaming Transcription",
          "streaming"
        ],
        [
          "Timestamps",
          "timestamps"
        ],
        [
          "Language Detection",
          "languageDetection"
        ]
      ]
    }
  ],
  "providerOptionTables": [
    {
      "id": "elevenlabs-provider-options"
    }
  ]
};
