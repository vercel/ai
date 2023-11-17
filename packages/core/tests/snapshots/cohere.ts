export const cohereChunks = [
  { text: ' Hello', is_finished: false },
  { text: ',', is_finished: false },
  { text: ' world', is_finished: false },
  { text: '.', is_finished: false },
  { text: ' ', is_finished: false },
  {
    is_finished: true,
    finish_reason: 'COMPLETE',
    response: {
      id: 'a15fdf82-758e-4d35-a520-40fbb7308631',
      generations: [
        {
          id: '9700d8ef-a8e5-4eb8-8288-3f0e0a1daed5',
          text: ' Hello, world. ',
          finish_reason: 'COMPLETE',
        },
      ],
      prompt: 'Hello',
    },
  },
];

export const cohereBedrockChunks = [
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
