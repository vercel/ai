export const InkeepEventStream = [
  {
    event: 'message_chunk',
    data: {
      chat_session_id: '12345',
      content_chunk: ' Hello',
      finish_reason: null,
    },
  },
  {
    event: 'message_chunk',
    data: {
      chat_session_id: '12345',
      content_chunk: ',',
      finish_reason: null,
    },
  },
  {
    event: 'message_chunk',
    data: {
      chat_session_id: '12345',
      content_chunk: ' world',
      finish_reason: null,
    },
  },
  {
    event: 'message_chunk',
    data: {
      chat_session_id: '12345',
      content_chunk: '.',
      finish_reason: null,
    },
  },
  {
    event: 'message_chunk',
    data: {
      chat_session_id: '12345',
      content_chunk: '',
      finish_reason: 'stop',
    },
  },
  {
    event: 'records_cited',
    data: {
      citations: [
        {
          number: 1,
          record: {
            url: 'https://inkeep.com',
            title: 'Inkeep',
            breadcrumbs: ['Home', 'About'],
          },
        },
      ],
    },
  },
];
