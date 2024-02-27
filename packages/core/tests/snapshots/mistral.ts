export const mistralChunks = [
  {
    id: 'eb7ce8e5329e4f309b7bfc1a958d450f',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'mistral-small',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null,
      },
    ],
    usage: null,
  },
  {
    id: 'eb7ce8e5329e4f309b7bfc1a958d450f',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'mistral-small',
    choices: [
      {
        delta: { role: null, content: 'Hello' },
        index: 0,
        finish_reason: null,
      },
    ],
    usage: null,
  },
  {
    id: 'eb7ce8e5329e4f309b7bfc1a958d450f',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'mistral-small',
    choices: [
      { delta: { role: null, content: ',' }, index: 0, finish_reason: null },
    ],
    usage: null,
  },
  {
    id: 'eb7ce8e5329e4f309b7bfc1a958d450f',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'mistral-small',
    choices: [
      {
        delta: { role: null, content: ' world' },
        index: 0,
        finish_reason: null,
      },
    ],
    usage: null,
  },
  {
    id: 'eb7ce8e5329e4f309b7bfc1a958d450f',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'mistral-small',
    choices: [
      { delta: { role: null, content: '.' }, index: 0, finish_reason: null },
    ],
    usage: null,
  },
  {
    id: 'eb7ce8e5329e4f309b7bfc1a958d450f',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'mistral-small',
    choices: [
      { delta: { role: null, content: '' }, index: 0, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 15, total_tokens: 245, completion_tokens: 230 },
  },
];
