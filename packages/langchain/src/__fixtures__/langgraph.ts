export const LANGGRAPH_RESPONSE = [
  [
    'values',
    {
      messages: [
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: {
            content: "What's the weather in Tokyo and what time is it there?",
            additional_kwargs: {},
            response_metadata: {},
            id: '5951ee02-4f16-4da5-ab33-7082677aa3d5',
          },
        },
      ],
    },
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
            id: 'resp_04214510f1bae868006940c268a6e8819fa2d4e1fe6f322e5d',
            model_name: 'gpt-5-2025-08-07',
            model: 'gpt-5-2025-08-07',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              id: 'rs_04214510f1bae868006940c2690a78819face386d6d7b493e4',
              type: 'reasoning',
              summary: [],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  type: 'summary_text',
                  text: '',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: '**Preparing',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' weather',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' and',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' time',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' data',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: "**\n\nI'm",
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' planning',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' to',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' use',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' the',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' weather',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' and',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' datetime',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' tools',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' for',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' Tokyo',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ',',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' taking',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' advantage',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' of',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' the',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' fact',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' they',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' can',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' run',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' in',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' parallel',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: '.',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' I',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: '’ll',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' set',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' the',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' temperature',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' to',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' Celsius',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' since',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' units',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' are',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' unspecified',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ',',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' and',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' I',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' can',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' choose',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' whether',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' to',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' use',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' a',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' full',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' or',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' short',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' format',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' for',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' the',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' time',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: '.',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' I',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' think',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' a',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' full',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' format',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' with',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' the',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' day',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' sounds',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' good',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: '.',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: " I'll",
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' call',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' both',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' functions',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' now',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' and',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' then',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' create',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' a',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' concise',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' response',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' inclusive',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' of',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' both',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' pieces',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' of',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' information',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: '.',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: " Let's",
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' go',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: ' ahead',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {
            reasoning: {
              type: 'reasoning',
              summary: [
                {
                  text: '!',
                  type: 'summary_text',
                  index: 0,
                },
              ],
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              name: 'get_weather',
              args: '',
              id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
              index: 1,
            },
          ],
          additional_kwargs: {
            __openai_function_call_ids__: {
              call_i1stUubDtqlmCGOvtUD9DqUo:
                'fc_04214510f1bae868006940c26eec08819faffd75d5b3ee6575',
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [
            {
              name: 'get_weather',
              args: {},
              id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
              type: 'tool_call',
            },
          ],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '{',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '{',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"city',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"city',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '":',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '":',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"Tokyo',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"Tokyo',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '",',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '",',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"units',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"units',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '":',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '":',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"c',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"c',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: 'elsius',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: 'elsius',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"}',
              index: 1,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"}',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              name: 'get_datetime',
              args: '',
              id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
              index: 2,
            },
          ],
          additional_kwargs: {
            __openai_function_call_ids__: {
              call_ri3SBHWTEUcRU3Qhyy2M3gty:
                'fc_04214510f1bae868006940c26ef274819faab5f40d7f73b63c',
            },
          },
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [
            {
              name: 'get_datetime',
              args: {},
              id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
              type: 'tool_call',
            },
          ],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '{',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '{',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"timezone',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"timezone',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '":',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '":',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"Asia',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"Asia',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '/T',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '/T',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: 'ok',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: 'ok',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: 'yo',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: 'yo',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '",',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '",',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"format',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"format',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '":',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '":',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"full',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"full',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [
            {
              type: 'tool_call_chunk',
              args: '"}',
              index: 2,
            },
          ],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [
            {
              name: '',
              args: '"}',
              error: 'Malformed args.',
              type: 'invalid_tool_call',
            },
          ],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
          content: [],
          tool_call_chunks: [],
          usage_metadata: {
            input_tokens: 346,
            output_tokens: 190,
            total_tokens: 536,
            input_token_details: {
              cache_read: 0,
            },
            output_token_details: {
              reasoning: 128,
            },
          },
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
            object: 'response',
            created_at: 1765851752,
            status: 'completed',
            background: false,
            error: null,
            incomplete_details: null,
            instructions: null,
            max_output_tokens: null,
            max_tool_calls: null,
            model: 'gpt-5-2025-08-07',
            output: [
              {
                id: 'rs_04214510f1bae868006940c2690a78819face386d6d7b493e4',
                type: 'reasoning',
                summary: [
                  {
                    type: 'summary_text',
                    text: "**Preparing weather and time data**\n\nI'm planning to use the weather and datetime tools for Tokyo, taking advantage of the fact they can run in parallel. I’ll set the temperature to Celsius since units are unspecified, and I can choose whether to use a full or short format for the time. I think a full format with the day sounds good. I'll call both functions now and then create a concise response inclusive of both pieces of information. Let's go ahead!",
                  },
                ],
              },
              {
                id: 'fc_04214510f1bae868006940c26eec08819faffd75d5b3ee6575',
                type: 'function_call',
                status: 'completed',
                arguments: '{"city":"Tokyo","units":"celsius"}',
                call_id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                name: 'get_weather',
              },
              {
                id: 'fc_04214510f1bae868006940c26ef274819faab5f40d7f73b63c',
                type: 'function_call',
                status: 'completed',
                arguments: '{"timezone":"Asia/Tokyo","format":"full"}',
                call_id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                name: 'get_datetime',
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            prompt_cache_key: null,
            prompt_cache_retention: null,
            reasoning: {
              effort: 'low',
              summary: 'detailed',
            },
            safety_identifier: null,
            service_tier: 'default',
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
              verbosity: 'medium',
            },
            tool_choice: 'auto',
            tools: [
              {
                type: 'function',
                description: 'Get the current weather in a city',
                name: 'get_weather',
                parameters: {
                  type: 'object',
                  properties: {
                    city: {
                      type: 'string',
                      description: 'The city name to get weather for',
                    },
                    units: {
                      type: 'string',
                      enum: ['fahrenheit', 'celsius'],
                      description: 'Temperature units',
                    },
                  },
                  required: ['city'],
                  additionalProperties: false,
                },
                strict: false,
              },
              {
                type: 'function',
                description:
                  'Search Wikipedia for information on a topic. Returns a brief summary.',
                name: 'wiki_search',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The topic to search for on Wikipedia',
                    },
                  },
                  required: ['query'],
                  additionalProperties: false,
                },
                strict: false,
              },
              {
                type: 'function',
                description:
                  'Get the current date and time, optionally in a specific timezone',
                name: 'get_datetime',
                parameters: {
                  type: 'object',
                  properties: {
                    timezone: {
                      type: 'string',
                      description:
                        'IANA timezone (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")',
                    },
                    format: {
                      type: 'string',
                      enum: ['full', 'short'],
                      description:
                        'Output format - full includes weekday and seconds',
                    },
                  },
                  additionalProperties: false,
                },
                strict: false,
              },
              {
                type: 'image_generation',
                background: 'auto',
                model: 'gpt-image-1',
                moderation: 'auto',
                n: 1,
                output_compression: 100,
                output_format: 'png',
                quality: 'high',
                size: '1024x1024',
              },
            ],
            top_logprobs: 0,
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 346,
              input_tokens_details: {
                cached_tokens: 0,
              },
              output_tokens: 190,
              output_tokens_details: {
                reasoning_tokens: 128,
              },
              total_tokens: 536,
            },
            user: null,
            metadata: {},
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 1,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        __pregel_task_id: '84501917-73e9-5b2c-b512-263b3baad616',
        checkpoint_ns: 'model_request:84501917-73e9-5b2c-b512-263b3baad616',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'values',
    {
      messages: [
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: {
            content: "What's the weather in Tokyo and what time is it there?",
            additional_kwargs: {},
            response_metadata: {},
            id: '5951ee02-4f16-4da5-ab33-7082677aa3d5',
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessageChunk'],
          kwargs: {
            content: [],
            additional_kwargs: {
              reasoning: {
                id: 'rs_04214510f1bae868006940c2690a78819face386d6d7b493e4',
                type: 'reasoning',
                summary: [
                  {
                    type: 'summary_text',
                    text: "**Preparing weather and time data**\n\nI'm planning to use the weather and datetime tools for Tokyo, taking advantage of the fact they can run in parallel. I’ll set the temperature to Celsius since units are unspecified, and I can choose whether to use a full or short format for the time. I think a full format with the day sounds good. I'll call both functions now and then create a concise response inclusive of both pieces of information. Let's go ahead!",
                    index: 0,
                  },
                ],
              },
              __openai_function_call_ids__: {
                call_i1stUubDtqlmCGOvtUD9DqUo:
                  'fc_04214510f1bae868006940c26eec08819faffd75d5b3ee6575',
                call_ri3SBHWTEUcRU3Qhyy2M3gty:
                  'fc_04214510f1bae868006940c26ef274819faab5f40d7f73b63c',
              },
            },
            response_metadata: {
              model_provider: 'openai',
              id: 'resp_04214510f1bae868006940c268a6e8819fa2d4e1fe6f322e5d',
              model_name: 'gpt-5-2025-08-07',
              model: 'gpt-5-2025-08-07gpt-5-2025-08-07',
              object: 'response',
              created_at: 1765851752,
              status: 'completed',
              background: false,
              error: null,
              incomplete_details: null,
              instructions: null,
              max_output_tokens: null,
              max_tool_calls: null,
              output: [
                {
                  id: 'rs_04214510f1bae868006940c2690a78819face386d6d7b493e4',
                  type: 'reasoning',
                  summary: [
                    {
                      type: 'summary_text',
                      text: "**Preparing weather and time data**\n\nI'm planning to use the weather and datetime tools for Tokyo, taking advantage of the fact they can run in parallel. I’ll set the temperature to Celsius since units are unspecified, and I can choose whether to use a full or short format for the time. I think a full format with the day sounds good. I'll call both functions now and then create a concise response inclusive of both pieces of information. Let's go ahead!",
                    },
                  ],
                },
                {
                  id: 'fc_04214510f1bae868006940c26eec08819faffd75d5b3ee6575',
                  type: 'function_call',
                  status: 'completed',
                  arguments: '{"city":"Tokyo","units":"celsius"}',
                  call_id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                  name: 'get_weather',
                },
                {
                  id: 'fc_04214510f1bae868006940c26ef274819faab5f40d7f73b63c',
                  type: 'function_call',
                  status: 'completed',
                  arguments: '{"timezone":"Asia/Tokyo","format":"full"}',
                  call_id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                  name: 'get_datetime',
                },
              ],
              parallel_tool_calls: true,
              previous_response_id: null,
              prompt_cache_key: null,
              prompt_cache_retention: null,
              reasoning: {
                effort: 'low',
                summary: 'detailed',
              },
              safety_identifier: null,
              service_tier: 'default',
              store: true,
              temperature: 1,
              text: {
                format: {
                  type: 'text',
                },
                verbosity: 'medium',
              },
              tool_choice: 'auto',
              tools: [
                {
                  type: 'function',
                  description: 'Get the current weather in a city',
                  name: 'get_weather',
                  parameters: {
                    type: 'object',
                    properties: {
                      city: {
                        type: 'string',
                        description: 'The city name to get weather for',
                      },
                      units: {
                        type: 'string',
                        enum: ['fahrenheit', 'celsius'],
                        description: 'Temperature units',
                      },
                    },
                    required: ['city'],
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'function',
                  description:
                    'Search Wikipedia for information on a topic. Returns a brief summary.',
                  name: 'wiki_search',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: {
                        type: 'string',
                        description: 'The topic to search for on Wikipedia',
                      },
                    },
                    required: ['query'],
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'function',
                  description:
                    'Get the current date and time, optionally in a specific timezone',
                  name: 'get_datetime',
                  parameters: {
                    type: 'object',
                    properties: {
                      timezone: {
                        type: 'string',
                        description:
                          'IANA timezone (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")',
                      },
                      format: {
                        type: 'string',
                        enum: ['full', 'short'],
                        description:
                          'Output format - full includes weekday and seconds',
                      },
                    },
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'image_generation',
                  background: 'auto',
                  model: 'gpt-image-1',
                  moderation: 'auto',
                  n: 1,
                  output_compression: 100,
                  output_format: 'png',
                  quality: 'high',
                  size: '1024x1024',
                },
              ],
              top_logprobs: 0,
              top_p: 1,
              truncation: 'disabled',
              usage: {
                input_tokens: 346,
                input_tokens_details: {
                  cached_tokens: 0,
                },
                output_tokens: 190,
                output_tokens_details: {
                  reasoning_tokens: 128,
                },
                total_tokens: 536,
              },
              user: null,
              metadata: {},
            },
            tool_call_chunks: [
              {
                type: 'tool_call_chunk',
                name: 'get_weather',
                args: '{"city":"Tokyo","units":"celsius"}',
                id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                index: 1,
              },
              {
                type: 'tool_call_chunk',
                name: 'get_datetime',
                args: '{"timezone":"Asia/Tokyo","format":"full"}',
                id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                index: 2,
              },
            ],
            id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
            usage_metadata: {
              input_tokens: 346,
              output_tokens: 190,
              total_tokens: 536,
              input_token_details: {
                cache_read: 0,
              },
              output_token_details: {
                reasoning: 128,
              },
            },
            tool_calls: [
              {
                name: 'get_weather',
                args: {
                  city: 'Tokyo',
                  units: 'celsius',
                },
                id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                type: 'tool_call',
              },
              {
                name: 'get_datetime',
                args: {
                  timezone: 'Asia/Tokyo',
                  format: 'full',
                },
                id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                type: 'tool_call',
              },
            ],
            invalid_tool_calls: [],
            name: 'model',
          },
        },
      ],
    },
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'ToolMessage'],
        kwargs: {
          status: 'success',
          content: 'Weather in Tokyo: 20°C, Clear skies',
          tool_call_id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
          name: 'get_weather',
          metadata: {},
          additional_kwargs: {},
          response_metadata: {},
          id: 'run-019b24f7-8283-7000-8000-0edb46d9dbe9-tool-call_i1stUubDtqlmCGOvtUD9DqUo',
        },
      },
      {
        tags: ['graph:step:2'],
        name: 'tools',
        langgraph_step: 2,
        langgraph_node: 'tools',
        langgraph_triggers: ['__pregel_push'],
        langgraph_path: ['__pregel_push', 0],
        langgraph_checkpoint_ns: 'tools:bcb9dba2-8d6f-503d-b070-3b1474ed7894',
        __pregel_task_id: 'bcb9dba2-8d6f-503d-b070-3b1474ed7894',
        checkpoint_ns: 'tools:bcb9dba2-8d6f-503d-b070-3b1474ed7894',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'ToolMessage'],
        kwargs: {
          status: 'success',
          content:
            'Current date and time in Asia/Tokyo: Tuesday, December 16, 2025 at 11:22:39 AM',
          tool_call_id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
          name: 'get_datetime',
          metadata: {},
          additional_kwargs: {},
          response_metadata: {},
          id: 'run-019b24f7-8283-7000-8000-129ebe5fda7a-tool-call_ri3SBHWTEUcRU3Qhyy2M3gty',
        },
      },
      {
        tags: ['graph:step:2'],
        name: 'tools',
        langgraph_step: 2,
        langgraph_node: 'tools',
        langgraph_triggers: ['__pregel_push'],
        langgraph_path: ['__pregel_push', 1],
        langgraph_checkpoint_ns: 'tools:67618492-e58d-5960-a524-39bfb4217c11',
        __pregel_task_id: '67618492-e58d-5960-a524-39bfb4217c11',
        checkpoint_ns: 'tools:67618492-e58d-5960-a524-39bfb4217c11',
      },
    ],
  ],
  [
    'values',
    {
      messages: [
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: {
            content: "What's the weather in Tokyo and what time is it there?",
            additional_kwargs: {},
            response_metadata: {},
            id: '5951ee02-4f16-4da5-ab33-7082677aa3d5',
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessageChunk'],
          kwargs: {
            content: [],
            additional_kwargs: {
              reasoning: {
                id: 'rs_04214510f1bae868006940c2690a78819face386d6d7b493e4',
                type: 'reasoning',
                summary: [
                  {
                    type: 'summary_text',
                    text: "**Preparing weather and time data**\n\nI'm planning to use the weather and datetime tools for Tokyo, taking advantage of the fact they can run in parallel. I’ll set the temperature to Celsius since units are unspecified, and I can choose whether to use a full or short format for the time. I think a full format with the day sounds good. I'll call both functions now and then create a concise response inclusive of both pieces of information. Let's go ahead!",
                    index: 0,
                  },
                ],
              },
              __openai_function_call_ids__: {
                call_i1stUubDtqlmCGOvtUD9DqUo:
                  'fc_04214510f1bae868006940c26eec08819faffd75d5b3ee6575',
                call_ri3SBHWTEUcRU3Qhyy2M3gty:
                  'fc_04214510f1bae868006940c26ef274819faab5f40d7f73b63c',
              },
            },
            response_metadata: {
              model_provider: 'openai',
              id: 'resp_04214510f1bae868006940c268a6e8819fa2d4e1fe6f322e5d',
              model_name: 'gpt-5-2025-08-07',
              model: 'gpt-5-2025-08-07gpt-5-2025-08-07',
              object: 'response',
              created_at: 1765851752,
              status: 'completed',
              background: false,
              error: null,
              incomplete_details: null,
              instructions: null,
              max_output_tokens: null,
              max_tool_calls: null,
              output: [
                {
                  id: 'rs_04214510f1bae868006940c2690a78819face386d6d7b493e4',
                  type: 'reasoning',
                  summary: [
                    {
                      type: 'summary_text',
                      text: "**Preparing weather and time data**\n\nI'm planning to use the weather and datetime tools for Tokyo, taking advantage of the fact they can run in parallel. I’ll set the temperature to Celsius since units are unspecified, and I can choose whether to use a full or short format for the time. I think a full format with the day sounds good. I'll call both functions now and then create a concise response inclusive of both pieces of information. Let's go ahead!",
                    },
                  ],
                },
                {
                  id: 'fc_04214510f1bae868006940c26eec08819faffd75d5b3ee6575',
                  type: 'function_call',
                  status: 'completed',
                  arguments: '{"city":"Tokyo","units":"celsius"}',
                  call_id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                  name: 'get_weather',
                },
                {
                  id: 'fc_04214510f1bae868006940c26ef274819faab5f40d7f73b63c',
                  type: 'function_call',
                  status: 'completed',
                  arguments: '{"timezone":"Asia/Tokyo","format":"full"}',
                  call_id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                  name: 'get_datetime',
                },
              ],
              parallel_tool_calls: true,
              previous_response_id: null,
              prompt_cache_key: null,
              prompt_cache_retention: null,
              reasoning: {
                effort: 'low',
                summary: 'detailed',
              },
              safety_identifier: null,
              service_tier: 'default',
              store: true,
              temperature: 1,
              text: {
                format: {
                  type: 'text',
                },
                verbosity: 'medium',
              },
              tool_choice: 'auto',
              tools: [
                {
                  type: 'function',
                  description: 'Get the current weather in a city',
                  name: 'get_weather',
                  parameters: {
                    type: 'object',
                    properties: {
                      city: {
                        type: 'string',
                        description: 'The city name to get weather for',
                      },
                      units: {
                        type: 'string',
                        enum: ['fahrenheit', 'celsius'],
                        description: 'Temperature units',
                      },
                    },
                    required: ['city'],
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'function',
                  description:
                    'Search Wikipedia for information on a topic. Returns a brief summary.',
                  name: 'wiki_search',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: {
                        type: 'string',
                        description: 'The topic to search for on Wikipedia',
                      },
                    },
                    required: ['query'],
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'function',
                  description:
                    'Get the current date and time, optionally in a specific timezone',
                  name: 'get_datetime',
                  parameters: {
                    type: 'object',
                    properties: {
                      timezone: {
                        type: 'string',
                        description:
                          'IANA timezone (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")',
                      },
                      format: {
                        type: 'string',
                        enum: ['full', 'short'],
                        description:
                          'Output format - full includes weekday and seconds',
                      },
                    },
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'image_generation',
                  background: 'auto',
                  model: 'gpt-image-1',
                  moderation: 'auto',
                  n: 1,
                  output_compression: 100,
                  output_format: 'png',
                  quality: 'high',
                  size: '1024x1024',
                },
              ],
              top_logprobs: 0,
              top_p: 1,
              truncation: 'disabled',
              usage: {
                input_tokens: 346,
                input_tokens_details: {
                  cached_tokens: 0,
                },
                output_tokens: 190,
                output_tokens_details: {
                  reasoning_tokens: 128,
                },
                total_tokens: 536,
              },
              user: null,
              metadata: {},
            },
            tool_call_chunks: [
              {
                type: 'tool_call_chunk',
                name: 'get_weather',
                args: '{"city":"Tokyo","units":"celsius"}',
                id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                index: 1,
              },
              {
                type: 'tool_call_chunk',
                name: 'get_datetime',
                args: '{"timezone":"Asia/Tokyo","format":"full"}',
                id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                index: 2,
              },
            ],
            id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
            usage_metadata: {
              input_tokens: 346,
              output_tokens: 190,
              total_tokens: 536,
              input_token_details: {
                cache_read: 0,
              },
              output_token_details: {
                reasoning: 128,
              },
            },
            tool_calls: [
              {
                name: 'get_weather',
                args: {
                  city: 'Tokyo',
                  units: 'celsius',
                },
                id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                type: 'tool_call',
              },
              {
                name: 'get_datetime',
                args: {
                  timezone: 'Asia/Tokyo',
                  format: 'full',
                },
                id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                type: 'tool_call',
              },
            ],
            invalid_tool_calls: [],
            name: 'model',
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'ToolMessage'],
          kwargs: {
            status: 'success',
            content: 'Weather in Tokyo: 20°C, Clear skies',
            tool_call_id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
            name: 'get_weather',
            metadata: {},
            additional_kwargs: {},
            response_metadata: {},
            id: 'run-019b24f7-8283-7000-8000-0edb46d9dbe9-tool-call_i1stUubDtqlmCGOvtUD9DqUo',
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'ToolMessage'],
          kwargs: {
            status: 'success',
            content:
              'Current date and time in Asia/Tokyo: Tuesday, December 16, 2025 at 11:22:39 AM',
            tool_call_id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
            name: 'get_datetime',
            metadata: {},
            additional_kwargs: {},
            response_metadata: {},
            id: 'run-019b24f7-8283-7000-8000-129ebe5fda7a-tool-call_ri3SBHWTEUcRU3Qhyy2M3gty',
          },
        },
      ],
    },
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
            id: 'resp_04214510f1bae868006940c26f5b00819f9f28ec35f99a3bc8',
            model_name: 'gpt-5-2025-08-07',
            model: 'gpt-5-2025-08-07',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'msg_04214510f1bae868006940c26fa224819fa0adf5b953e3d3e8',
          content: [],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: 'Here',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '’s',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' Tokyo',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' right',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' now',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ':\n',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '-',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' Weather',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ':',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' ',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '20',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '°C',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ',',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' clear',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' skies',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '\n',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '-',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' Local',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' time',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ':',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' Tuesday',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ',',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' December',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' ',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '16',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ',',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' ',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '202',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '5',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' at',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' ',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '11',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ':',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '22',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' AM',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ' (',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: 'Asia',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: '/T',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: 'ok',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: 'yo',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [
            {
              type: 'text',
              text: ')',
              index: 0,
            },
          ],
          tool_call_chunks: [],
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'messages',
    [
      {
        lc: 1,
        type: 'constructor',
        id: ['langchain_core', 'messages', 'AIMessageChunk'],
        kwargs: {
          id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
          content: [],
          tool_call_chunks: [],
          usage_metadata: {
            input_tokens: 927,
            output_tokens: 45,
            total_tokens: 972,
            input_token_details: {
              cache_read: 0,
            },
            output_token_details: {
              reasoning: 0,
            },
          },
          additional_kwargs: {},
          response_metadata: {
            model_provider: 'openai',
            object: 'response',
            created_at: 1765851759,
            status: 'completed',
            background: false,
            error: null,
            incomplete_details: null,
            instructions: null,
            max_output_tokens: null,
            max_tool_calls: null,
            model: 'gpt-5-2025-08-07',
            output: [
              {
                id: 'msg_04214510f1bae868006940c26fa224819fa0adf5b953e3d3e8',
                type: 'message',
                status: 'completed',
                content: [
                  {
                    type: 'output_text',
                    annotations: [],
                    logprobs: [],
                    text: 'Here’s Tokyo right now:\n- Weather: 20°C, clear skies\n- Local time: Tuesday, December 16, 2025 at 11:22 AM (Asia/Tokyo)',
                  },
                ],
                role: 'assistant',
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            prompt_cache_key: null,
            prompt_cache_retention: null,
            reasoning: {
              effort: 'low',
              summary: 'detailed',
            },
            safety_identifier: null,
            service_tier: 'default',
            store: true,
            temperature: 1,
            text: {
              format: {
                type: 'text',
              },
              verbosity: 'medium',
            },
            tool_choice: 'auto',
            tools: [
              {
                type: 'function',
                description: 'Get the current weather in a city',
                name: 'get_weather',
                parameters: {
                  type: 'object',
                  properties: {
                    city: {
                      type: 'string',
                      description: 'The city name to get weather for',
                    },
                    units: {
                      type: 'string',
                      enum: ['fahrenheit', 'celsius'],
                      description: 'Temperature units',
                    },
                  },
                  required: ['city'],
                  additionalProperties: false,
                },
                strict: false,
              },
              {
                type: 'function',
                description:
                  'Search Wikipedia for information on a topic. Returns a brief summary.',
                name: 'wiki_search',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The topic to search for on Wikipedia',
                    },
                  },
                  required: ['query'],
                  additionalProperties: false,
                },
                strict: false,
              },
              {
                type: 'function',
                description:
                  'Get the current date and time, optionally in a specific timezone',
                name: 'get_datetime',
                parameters: {
                  type: 'object',
                  properties: {
                    timezone: {
                      type: 'string',
                      description:
                        'IANA timezone (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")',
                    },
                    format: {
                      type: 'string',
                      enum: ['full', 'short'],
                      description:
                        'Output format - full includes weekday and seconds',
                    },
                  },
                  additionalProperties: false,
                },
                strict: false,
              },
              {
                type: 'image_generation',
                background: 'auto',
                model: 'gpt-image-1',
                moderation: 'auto',
                n: 1,
                output_compression: 100,
                output_format: 'png',
                quality: 'high',
                size: '1024x1024',
              },
            ],
            top_logprobs: 0,
            top_p: 1,
            truncation: 'disabled',
            usage: {
              input_tokens: 927,
              input_tokens_details: {
                cached_tokens: 0,
              },
              output_tokens: 45,
              output_tokens_details: {
                reasoning_tokens: 0,
              },
              total_tokens: 972,
            },
            user: null,
            metadata: {},
          },
          tool_calls: [],
          invalid_tool_calls: [],
        },
      },
      {
        tags: [],
        langgraph_step: 3,
        langgraph_node: 'model_request',
        langgraph_triggers: ['branch:to:model_request'],
        langgraph_path: ['__pregel_pull', 'model_request'],
        langgraph_checkpoint_ns:
          'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        __pregel_task_id: '108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        checkpoint_ns: 'model_request:108e900b-45ba-5a54-bfb0-bfce3b3df8e0',
        ls_provider: 'openai',
        ls_model_name: 'gpt-5',
        ls_model_type: 'chat',
      },
    ],
  ],
  [
    'values',
    {
      messages: [
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: {
            content: "What's the weather in Tokyo and what time is it there?",
            additional_kwargs: {},
            response_metadata: {},
            id: '5951ee02-4f16-4da5-ab33-7082677aa3d5',
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessageChunk'],
          kwargs: {
            content: [],
            additional_kwargs: {
              reasoning: {
                id: 'rs_04214510f1bae868006940c2690a78819face386d6d7b493e4',
                type: 'reasoning',
                summary: [
                  {
                    type: 'summary_text',
                    text: "**Preparing weather and time data**\n\nI'm planning to use the weather and datetime tools for Tokyo, taking advantage of the fact they can run in parallel. I’ll set the temperature to Celsius since units are unspecified, and I can choose whether to use a full or short format for the time. I think a full format with the day sounds good. I'll call both functions now and then create a concise response inclusive of both pieces of information. Let's go ahead!",
                    index: 0,
                  },
                ],
              },
              __openai_function_call_ids__: {
                call_i1stUubDtqlmCGOvtUD9DqUo:
                  'fc_04214510f1bae868006940c26eec08819faffd75d5b3ee6575',
                call_ri3SBHWTEUcRU3Qhyy2M3gty:
                  'fc_04214510f1bae868006940c26ef274819faab5f40d7f73b63c',
              },
            },
            response_metadata: {
              model_provider: 'openai',
              id: 'resp_04214510f1bae868006940c268a6e8819fa2d4e1fe6f322e5d',
              model_name: 'gpt-5-2025-08-07',
              model: 'gpt-5-2025-08-07gpt-5-2025-08-07',
              object: 'response',
              created_at: 1765851752,
              status: 'completed',
              background: false,
              error: null,
              incomplete_details: null,
              instructions: null,
              max_output_tokens: null,
              max_tool_calls: null,
              output: [
                {
                  id: 'rs_04214510f1bae868006940c2690a78819face386d6d7b493e4',
                  type: 'reasoning',
                  summary: [
                    {
                      type: 'summary_text',
                      text: "**Preparing weather and time data**\n\nI'm planning to use the weather and datetime tools for Tokyo, taking advantage of the fact they can run in parallel. I’ll set the temperature to Celsius since units are unspecified, and I can choose whether to use a full or short format for the time. I think a full format with the day sounds good. I'll call both functions now and then create a concise response inclusive of both pieces of information. Let's go ahead!",
                    },
                  ],
                },
                {
                  id: 'fc_04214510f1bae868006940c26eec08819faffd75d5b3ee6575',
                  type: 'function_call',
                  status: 'completed',
                  arguments: '{"city":"Tokyo","units":"celsius"}',
                  call_id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                  name: 'get_weather',
                },
                {
                  id: 'fc_04214510f1bae868006940c26ef274819faab5f40d7f73b63c',
                  type: 'function_call',
                  status: 'completed',
                  arguments: '{"timezone":"Asia/Tokyo","format":"full"}',
                  call_id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                  name: 'get_datetime',
                },
              ],
              parallel_tool_calls: true,
              previous_response_id: null,
              prompt_cache_key: null,
              prompt_cache_retention: null,
              reasoning: {
                effort: 'low',
                summary: 'detailed',
              },
              safety_identifier: null,
              service_tier: 'default',
              store: true,
              temperature: 1,
              text: {
                format: {
                  type: 'text',
                },
                verbosity: 'medium',
              },
              tool_choice: 'auto',
              tools: [
                {
                  type: 'function',
                  description: 'Get the current weather in a city',
                  name: 'get_weather',
                  parameters: {
                    type: 'object',
                    properties: {
                      city: {
                        type: 'string',
                        description: 'The city name to get weather for',
                      },
                      units: {
                        type: 'string',
                        enum: ['fahrenheit', 'celsius'],
                        description: 'Temperature units',
                      },
                    },
                    required: ['city'],
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'function',
                  description:
                    'Search Wikipedia for information on a topic. Returns a brief summary.',
                  name: 'wiki_search',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: {
                        type: 'string',
                        description: 'The topic to search for on Wikipedia',
                      },
                    },
                    required: ['query'],
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'function',
                  description:
                    'Get the current date and time, optionally in a specific timezone',
                  name: 'get_datetime',
                  parameters: {
                    type: 'object',
                    properties: {
                      timezone: {
                        type: 'string',
                        description:
                          'IANA timezone (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")',
                      },
                      format: {
                        type: 'string',
                        enum: ['full', 'short'],
                        description:
                          'Output format - full includes weekday and seconds',
                      },
                    },
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'image_generation',
                  background: 'auto',
                  model: 'gpt-image-1',
                  moderation: 'auto',
                  n: 1,
                  output_compression: 100,
                  output_format: 'png',
                  quality: 'high',
                  size: '1024x1024',
                },
              ],
              top_logprobs: 0,
              top_p: 1,
              truncation: 'disabled',
              usage: {
                input_tokens: 346,
                input_tokens_details: {
                  cached_tokens: 0,
                },
                output_tokens: 190,
                output_tokens_details: {
                  reasoning_tokens: 128,
                },
                total_tokens: 536,
              },
              user: null,
              metadata: {},
            },
            tool_call_chunks: [
              {
                type: 'tool_call_chunk',
                name: 'get_weather',
                args: '{"city":"Tokyo","units":"celsius"}',
                id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                index: 1,
              },
              {
                type: 'tool_call_chunk',
                name: 'get_datetime',
                args: '{"timezone":"Asia/Tokyo","format":"full"}',
                id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                index: 2,
              },
            ],
            id: 'run-019b24f7-685f-7000-8000-0ecc6fca785e',
            usage_metadata: {
              input_tokens: 346,
              output_tokens: 190,
              total_tokens: 536,
              input_token_details: {
                cache_read: 0,
              },
              output_token_details: {
                reasoning: 128,
              },
            },
            tool_calls: [
              {
                name: 'get_weather',
                args: {
                  city: 'Tokyo',
                  units: 'celsius',
                },
                id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
                type: 'tool_call',
              },
              {
                name: 'get_datetime',
                args: {
                  timezone: 'Asia/Tokyo',
                  format: 'full',
                },
                id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
                type: 'tool_call',
              },
            ],
            invalid_tool_calls: [],
            name: 'model',
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'ToolMessage'],
          kwargs: {
            status: 'success',
            content: 'Weather in Tokyo: 20°C, Clear skies',
            tool_call_id: 'call_i1stUubDtqlmCGOvtUD9DqUo',
            name: 'get_weather',
            metadata: {},
            additional_kwargs: {},
            response_metadata: {},
            id: 'run-019b24f7-8283-7000-8000-0edb46d9dbe9-tool-call_i1stUubDtqlmCGOvtUD9DqUo',
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'ToolMessage'],
          kwargs: {
            status: 'success',
            content:
              'Current date and time in Asia/Tokyo: Tuesday, December 16, 2025 at 11:22:39 AM',
            tool_call_id: 'call_ri3SBHWTEUcRU3Qhyy2M3gty',
            name: 'get_datetime',
            metadata: {},
            additional_kwargs: {},
            response_metadata: {},
            id: 'run-019b24f7-8283-7000-8000-129ebe5fda7a-tool-call_ri3SBHWTEUcRU3Qhyy2M3gty',
          },
        },
        {
          lc: 1,
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessageChunk'],
          kwargs: {
            content: [
              {
                type: 'text',
                text: 'Here’s Tokyo right now:\n- Weather: 20°C, clear skies\n- Local time: Tuesday, December 16, 2025 at 11:22 AM (Asia/Tokyo)',
                index: 0,
              },
            ],
            additional_kwargs: {},
            response_metadata: {
              model_provider: 'openai',
              id: 'resp_04214510f1bae868006940c26f5b00819f9f28ec35f99a3bc8',
              model_name: 'gpt-5-2025-08-07',
              model: 'gpt-5-2025-08-07gpt-5-2025-08-07',
              object: 'response',
              created_at: 1765851759,
              status: 'completed',
              background: false,
              error: null,
              incomplete_details: null,
              instructions: null,
              max_output_tokens: null,
              max_tool_calls: null,
              output: [
                {
                  id: 'msg_04214510f1bae868006940c26fa224819fa0adf5b953e3d3e8',
                  type: 'message',
                  status: 'completed',
                  content: [
                    {
                      type: 'output_text',
                      annotations: [],
                      logprobs: [],
                      text: 'Here’s Tokyo right now:\n- Weather: 20°C, clear skies\n- Local time: Tuesday, December 16, 2025 at 11:22 AM (Asia/Tokyo)',
                    },
                  ],
                  role: 'assistant',
                },
              ],
              parallel_tool_calls: true,
              previous_response_id: null,
              prompt_cache_key: null,
              prompt_cache_retention: null,
              reasoning: {
                effort: 'low',
                summary: 'detailed',
              },
              safety_identifier: null,
              service_tier: 'default',
              store: true,
              temperature: 1,
              text: {
                format: {
                  type: 'text',
                },
                verbosity: 'medium',
              },
              tool_choice: 'auto',
              tools: [
                {
                  type: 'function',
                  description: 'Get the current weather in a city',
                  name: 'get_weather',
                  parameters: {
                    type: 'object',
                    properties: {
                      city: {
                        type: 'string',
                        description: 'The city name to get weather for',
                      },
                      units: {
                        type: 'string',
                        enum: ['fahrenheit', 'celsius'],
                        description: 'Temperature units',
                      },
                    },
                    required: ['city'],
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'function',
                  description:
                    'Search Wikipedia for information on a topic. Returns a brief summary.',
                  name: 'wiki_search',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: {
                        type: 'string',
                        description: 'The topic to search for on Wikipedia',
                      },
                    },
                    required: ['query'],
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'function',
                  description:
                    'Get the current date and time, optionally in a specific timezone',
                  name: 'get_datetime',
                  parameters: {
                    type: 'object',
                    properties: {
                      timezone: {
                        type: 'string',
                        description:
                          'IANA timezone (e.g., "America/New_York", "Europe/London", "Asia/Tokyo")',
                      },
                      format: {
                        type: 'string',
                        enum: ['full', 'short'],
                        description:
                          'Output format - full includes weekday and seconds',
                      },
                    },
                    additionalProperties: false,
                  },
                  strict: false,
                },
                {
                  type: 'image_generation',
                  background: 'auto',
                  model: 'gpt-image-1',
                  moderation: 'auto',
                  n: 1,
                  output_compression: 100,
                  output_format: 'png',
                  quality: 'high',
                  size: '1024x1024',
                },
              ],
              top_logprobs: 0,
              top_p: 1,
              truncation: 'disabled',
              usage: {
                input_tokens: 927,
                input_tokens_details: {
                  cached_tokens: 0,
                },
                output_tokens: 45,
                output_tokens_details: {
                  reasoning_tokens: 0,
                },
                total_tokens: 972,
              },
              user: null,
              metadata: {},
            },
            tool_call_chunks: [],
            id: 'run-019b24f7-829a-7000-8000-0866f61b7d07',
            usage_metadata: {
              input_tokens: 927,
              output_tokens: 45,
              total_tokens: 972,
              input_token_details: {
                cache_read: 0,
              },
              output_token_details: {
                reasoning: 0,
              },
            },
            tool_calls: [],
            invalid_tool_calls: [],
            name: 'model',
          },
        },
      ],
    },
  ],
];
