// "Hello, world."

export default [
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

export const JSONParseTestConvo = [{
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
      delta: { content: '{ ' },
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
  choices: [{ delta: { content: '"a": ' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [
    {
      delta: { content: '"bc123" ' },
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
  choices: [{ delta: { content: '} \n\n' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [{ delta: { content: '\n\n' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [{ delta: { content: '\n\n' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [{ delta: { content: '{ "' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [{ delta: { content: 'd": "' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [{ delta: { content: 'efg456' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [{ delta: { content: '" }\n\n' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [{ delta: { content: '     ' }, index: 0, finish_reason: null }]
},
{
  id: 'chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC',
  object: 'chat.completion.chunk',
  created: 1686901302,
  model: 'gpt-3.5-turbo-0301',
  choices: [{ delta: {}, index: 0, finish_reason: 'stop' }]
}]