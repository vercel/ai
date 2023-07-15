export const chatCompletionChunks = [
  {
    id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'gpt-3.5-turbo-0301',
    choices: [
      {
        delta: { role: 'assistant' },
        index: 0,
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'gpt-3.5-turbo-0301',
    choices: [
      {
        delta: { content: 'Hello' },
        index: 0,
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'gpt-3.5-turbo-0301',
    choices: [{ delta: { content: ',' }, index: 0, finish_reason: null }]
  },
  {
    id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'gpt-3.5-turbo-0301',
    choices: [
      {
        delta: { content: ' world' },
        index: 0,
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'gpt-3.5-turbo-0301',
    choices: [{ delta: { content: '.' }, index: 0, finish_reason: null }]
  },
  {
    id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
    object: 'chat.completion.chunk',
    created: 1686901302,
    model: 'gpt-3.5-turbo-0301',
    choices: [{ delta: {}, index: 0, finish_reason: 'stop' }]
  }
]

export const chatCompletionChunksWithFunctionCall = [
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: null,
          function_call: { name: 'get_current_weather', arguments: '' }
        },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: '{\n' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: '"' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: 'location' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: '":' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: ' "' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: 'Char' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: 'l' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: 'ottesville' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: ',' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: ' Virginia' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: '",\n' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: '"' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: 'format' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: '":' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: ' "' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: 'c' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: 'elsius' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: '"\n' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [
      {
        index: 0,
        delta: { function_call: { arguments: '}' } },
        finish_reason: null
      }
    ]
  },
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [{ index: 0, delta: {}, finish_reason: 'function_call' }]
  }
]

export const chatCompletionChunksWithSpecifiedFunctionCall = [
  ...chatCompletionChunksWithFunctionCall,
  {
    id: 'chatcmpl-7WBy19k4tnzMa0svAIAqkqeIaKZh8',
    object: 'chat.completion.chunk',
    created: 1687906853,
    model: 'gpt-3.5-turbo-0613',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] // finish_reason is 'stop' whenever you provide a function to function_call parameter
  }
]
