// @ts-nocheck
import { gladia } from '@ai-sdk/gladia';
import { transcribe } from 'ai';

const result1 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      language: 'en',
      diarization: true,
    },
  },
});

const result2 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      enableCodeSwitching: true,
      codeSwitchingConfig: {
        languages: ['en', 'fr'],
      },
    },
  },
});

const result3 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      customVocabulary: ['Gladia', 'AI SDK'],
      summarization: true,
    },
  },
});

const result4 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      contextPrompt: 'transcribe this meeting',
      moderation: true,
      chapterization: true,
      nameConsistency: true,
      structuredDataExtraction: true,
      structuredDataExtractionConfig: {
        classes: ['person', 'company'],
      },
      displayMode: true,
      diarizationConfig: {
        numberOfSpeakers: 2,
        enhanced: true,
      },
    },
  },
});

const result5 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      languageConfig: {
        languages: ['en'],
      },
      piiRedaction: true,
    },
  },
});

const result6 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      language: 'en',
      languageConfig: {
        languages: ['de'],
      },
    },
  },
});
