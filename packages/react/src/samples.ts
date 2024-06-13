/*
 * Sample stream events from OpenAI Assistant API for testing
 */

import { AssistantStreamPart } from '@ai-sdk/ui-utils';

export const firstRun: AssistantStreamPart[] = [
  {
    event: 'thread.run.created',
    data: {
      id: 'run_01',
      object: 'thread.run',
      created_at: 1718287925,
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      status: 'queued',
      started_at: null,
      expires_at: 1718288525,
      cancelled_at: null,
      failed_at: null,
      completed_at: null,
      required_action: null,
      last_error: null,
      model: 'gpt-4',
      instructions: '',
      tools: [],
      tool_resources: {
        code_interpreter: {
          file_ids: [],
        },
      },
      metadata: {},
      temperature: 1,
      top_p: 1,
      max_completion_tokens: null,
      max_prompt_tokens: null,
      truncation_strategy: {
        type: 'auto',
        last_messages: null,
      },
      incomplete_details: null,
      usage: null,
      response_format: 'auto',
      tool_choice: 'auto',
      parallel_tool_calls: true,
    },
  },
  {
    event: 'thread.run.queued',
    data: {
      id: 'run_01',
      object: 'thread.run',
      created_at: 1718287925,
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      status: 'queued',
      started_at: null,
      expires_at: 1718288525,
      cancelled_at: null,
      failed_at: null,
      completed_at: null,
      required_action: null,
      last_error: null,
      model: 'gpt-4',
      instructions: '',
      tools: [],
      tool_resources: {
        code_interpreter: {
          file_ids: [],
        },
      },
      metadata: {},
      temperature: 1,
      top_p: 1,
      max_completion_tokens: null,
      max_prompt_tokens: null,
      truncation_strategy: {
        type: 'auto',
        last_messages: null,
      },
      incomplete_details: null,
      usage: null,
      response_format: 'auto',
      tool_choice: 'auto',
      parallel_tool_calls: true,
    },
  },
  {
    event: 'thread.run.in_progress',
    data: {
      id: 'run_01',
      object: 'thread.run',
      created_at: 1718287925,
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      status: 'in_progress',
      started_at: 1718287926,
      expires_at: 1718288525,
      cancelled_at: null,
      failed_at: null,
      completed_at: null,
      required_action: null,
      last_error: null,
      model: 'gpt-4',
      instructions: '',
      tools: [],
      tool_resources: {
        code_interpreter: {
          file_ids: [],
        },
      },
      metadata: {},
      temperature: 1,
      top_p: 1,
      max_completion_tokens: null,
      max_prompt_tokens: null,
      truncation_strategy: {
        type: 'auto',
        last_messages: null,
      },
      incomplete_details: null,
      usage: null,
      response_format: 'auto',
      tool_choice: 'auto',
      parallel_tool_calls: true,
    },
  },
  {
    event: 'thread.run.step.created',
    data: {
      id: 'step_01',
      object: 'thread.run.step',
      created_at: 1718287927,
      run_id: 'run_01',
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      type: 'message_creation',
      status: 'in_progress',
      cancelled_at: null,
      completed_at: null,
      expires_at: 1718288525,
      failed_at: null,
      last_error: null,
      step_details: {
        type: 'message_creation',
        message_creation: {
          message_id: 'msg_1',
        },
      },
      usage: null,
    },
  },
  {
    event: 'thread.run.step.in_progress',
    data: {
      id: 'step_01',
      object: 'thread.run.step',
      created_at: 1718287927,
      run_id: 'run_01',
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      type: 'message_creation',
      status: 'in_progress',
      cancelled_at: null,
      completed_at: null,
      expires_at: 1718288525,
      failed_at: null,
      last_error: null,
      step_details: {
        type: 'message_creation',
        message_creation: {
          message_id: 'msg_1',
        },
      },
      usage: null,
    },
  },
  {
    event: 'thread.message.created',
    data: {
      id: 'msg_1',
      object: 'thread.message',
      created_at: 1718287927,
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      run_id: 'run_01',
      status: 'in_progress',
      incomplete_details: null,
      incomplete_at: null,
      completed_at: null,
      role: 'assistant',
      content: [],
      attachments: [],
      metadata: {},
    },
  },
  {
    event: 'thread.message.in_progress',
    data: {
      id: 'msg_1',
      object: 'thread.message',
      created_at: 1718287927,
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      run_id: 'run_01',
      status: 'in_progress',
      incomplete_details: null,
      incomplete_at: null,
      completed_at: null,
      role: 'assistant',
      content: [],
      attachments: [],
      metadata: {},
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: 'Hello',
              annotations: [],
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: '!',
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: ' How',
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: ' can',
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: ' I',
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: ' assist',
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: ' you',
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: ' today',
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.delta',
    data: {
      id: 'msg_1',
      object: 'thread.message.delta',
      delta: {
        content: [
          {
            index: 0,
            type: 'text',
            text: {
              value: '?',
            },
          },
        ],
      },
    },
  },
  {
    event: 'thread.message.completed',
    data: {
      id: 'msg_1',
      object: 'thread.message',
      created_at: 1718287927,
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      run_id: 'run_01',
      status: 'completed',
      incomplete_details: null,
      incomplete_at: null,
      completed_at: 1718287927,
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: {
            value: 'Hello! How can I assist you today?',
            annotations: [],
          },
        },
      ],
      attachments: [],
      metadata: {},
    },
  },
  {
    event: 'thread.run.step.completed',
    data: {
      id: 'step_01',
      object: 'thread.run.step',
      created_at: 1718287927,
      run_id: 'run_01',
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      type: 'message_creation',
      status: 'completed',
      cancelled_at: null,
      completed_at: 1718287927,
      expires_at: 1718288525,
      failed_at: null,
      last_error: null,
      step_details: {
        type: 'message_creation',
        message_creation: {
          message_id: 'msg_1',
        },
      },
      usage: {
        prompt_tokens: 11,
        completion_tokens: 11,
        total_tokens: 22,
      },
    },
  },
  {
    event: 'thread.run.completed',
    data: {
      id: 'run_01',
      object: 'thread.run',
      created_at: 1718287925,
      assistant_id: 'asst_01',
      thread_id: 'thread_01',
      status: 'completed',
      started_at: 1718287926,
      expires_at: null,
      cancelled_at: null,
      failed_at: null,
      completed_at: 1718287927,
      required_action: null,
      last_error: null,
      model: 'gpt-4',
      instructions: '',
      tools: [],
      tool_resources: {
        code_interpreter: {
          file_ids: [],
        },
      },
      metadata: {},
      temperature: 1,
      top_p: 1,
      max_completion_tokens: null,
      max_prompt_tokens: null,
      truncation_strategy: {
        type: 'auto',
        last_messages: null,
      },
      incomplete_details: null,
      usage: {
        prompt_tokens: 11,
        completion_tokens: 11,
        total_tokens: 22,
      },
      response_format: 'auto',
      tool_choice: 'auto',
      parallel_tool_calls: true,
    },
  },
];
