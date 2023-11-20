export const bedrockAnthropicChunks = [
  { completion: ' Hello', stop_reason: null, stop: null },
  { completion: ',', stop_reason: null, stop: null },
  { completion: ' world', stop_reason: null, stop: null },
  { completion: '.', stop_reason: 'stop_sequence', stop: '\n\nHuman:' },
];

export const bedrockCohereChunks = [
  {
    generations: [
      {
        finish_reason: 'COMPLETE',
        id: '0c72c609-c8ac-4601-a323-653db56c8d80',
        text: ' Hi! How can I help you today?',
      },
    ],
  },
];

export const bedrockLlama2Chunks = [
  {
    generation: '',
    prompt_token_count: 10,
    generation_token_count: 1,
    stop_reason: null,
  },
  {
    generation: ' Hello',
    prompt_token_count: null,
    generation_token_count: 2,
    stop_reason: null,
  },
  {
    generation: ',',
    prompt_token_count: null,
    generation_token_count: 3,
    stop_reason: null,
  },
  {
    generation: ' world',
    prompt_token_count: null,
    generation_token_count: 4,
    stop_reason: null,
  },
  {
    generation: '.',
    prompt_token_count: null,
    generation_token_count: 5,
    stop_reason: null,
  },
  {
    generation: '',
    prompt_token_count: null,
    generation_token_count: 6,
    stop_reason: 'length',
  },
];
