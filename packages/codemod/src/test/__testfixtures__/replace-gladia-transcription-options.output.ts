// @ts-nocheck
import { gladia } from '@ai-sdk/gladia';
import { transcribe } from 'ai';

const result1 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      diarization: true,

      languageConfig: {
        languages: ['en']
      }
    },
  },
});

const result2 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      languageConfig: {
        languages: ['en', 'fr'],
        codeSwitching: true
      }
    },
  },
});

const result3 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      customVocabulary: true,
      summarization: true,

      customVocabularyConfig: {
        vocabulary: ['Gladia', 'AI SDK']
      }
    },
  },
});

const result4 = await transcribe({
  model: gladia.transcription(),
  audio: new Uint8Array(),
  providerOptions: {
    gladia: {
      diarizationConfig: {
        numberOfSpeakers: 2
      }
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
      languageConfig: {
        languages: ['de'],
      }
    },
  },
});
