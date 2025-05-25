// TEMP MOCK DATA:

const noApprovalChunks = [
  {
    type: 'response.created',
    response: {
      id: 'resp_6832bcbeccec81919294c73893613e5606e699d7385bd583',
      created_at: 1748155583,
      model: 'gpt-4o-2024-08-06',
    },
  },
  {
    type: 'response.in_progress',
    sequence_number: 1,
    response: {
      id: 'resp_6832bcbeccec81919294c73893613e5606e699d7385bd583',
      object: 'response',
      created_at: 1748155583,
      status: 'in_progress',
      background: false,
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model: 'gpt-4o-2024-08-06',
      output: [],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: { effort: null, summary: null },
      service_tier: 'auto',
      store: true,
      temperature: 0,
      text: {
        format: {
          type: 'text',
        },
      },
      tool_choice: 'auto',
      tools: [
        {
          type: 'mcp',
          allowed_tools: ['ask_question'],
          headers: null,
          require_approval: 'never',
          server_label: 'deepwiki',
          server_url: 'https://mcp.deepwiki.com/<redacted>',
        },
      ],
      top_p: 1,
      truncation: 'disabled',
      usage: null,
      user: null,
      metadata: {},
    },
  },
  {
    type: 'response.output_item.added',
    sequence_number: 2,
    output_index: 0,
    item: {
      id: 'mcpl_6832bcbf359c819194a482d56148258606e699d7385bd583',
      type: 'mcp_list_tools',
      server_label: 'deepwiki',
      tools: [],
    },
  },
  {
    type: 'response.mcp_list_tools.in_progress',
    sequence_number: 3,
    output_index: 0,
    item_id: 'mcpl_6832bcbf359c819194a482d56148258606e699d7385bd583',
  },
  {
    type: 'response.mcp_list_tools.completed',
    sequence_number: 4,
    output_index: 0,
    item_id: 'mcpl_6832bcbf359c819194a482d56148258606e699d7385bd583',
  },
  {
    type: 'response.output_item.done',
    sequence_number: 5,
    output_index: 0,
    item: {
      id: 'mcpl_6832bf04f03c81918dfaf218752d0b6103f44701adb0e0bb',
      type: 'mcp_list_tools',
      server_label: 'deepwiki',
      tools: [
        {
          annotations: null,
          description: 'Ask any question about a GitHub repository',
          input_schema: {
            type: 'object',
            properties: {
              repoName: {
                type: 'string',
                description:
                  'GitHub repository: owner/repo (e.g. "facebook/react")',
              },
              question: {
                type: 'string',
                description: 'The question to ask about the repository',
              },
            },
            required: ['repoName', 'question'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
          name: 'ask_question',
        },
      ],
    },
  },
  {
    type: 'response.output_item.added',
    output_index: 1,
    item: {
      type: 'mcp_call',
      id: 'mcp_6832bccbc8488191847e97b534461d1806e699d7385bd583',
      name: 'ask_question',
      server_label: 'deepwiki',
      error: null,
      output: null,
      arguments: '',
    },
  },
  {
    type: 'response.mcp_call.in_progress',
    sequence_number: 7,
    output_index: 1,
    item_id: 'mcp_6832bccbc8488191847e97b534461d1806e699d7385bd583',
  },
  {
    type: 'response.mcp_call_arguments.delta',
    sequence_number: 8,
    output_index: 1,
    item_id: 'mcp_6832bccbc8488191847e97b534461d1806e699d7385bd583',
    delta:
      '{"repoName":"modelcontextprotocol/modelcontextprotocol","question":"What transport protocols does the 2025-03-26 version of the MCP spec support?"}',
  },
  {
    type: 'response.mcp_call_arguments.done',
    sequence_number: 9,
    output_index: 1,
    item_id: 'mcp_6832bccbc8488191847e97b534461d1806e699d7385bd583',
    arguments:
      '{"repoName":"modelcontextprotocol/modelcontextprotocol","question":"What transport protocols does the 2025-03-26 version of the MCP spec support?"}',
  },
  {
    type: 'response.mcp_call.completed',
    sequence_number: 10,
    output_index: 1,
    item_id: 'mcp_6832bccbc8488191847e97b534461d1806e699d7385bd583',
  },
  {
    type: 'response.output_item.done',
    output_index: 1,
    item: {
      type: 'mcp_call',
      id: 'mcp_6832bccbc8488191847e97b534461d1806e699d7385bd583',
      name: 'ask_question',
      server_label: 'deepwiki',
      error: null,
      output:
        'The 2025-03-26 version of the Model Context Protocol (MCP) specification supports two standard transport mechanisms: `stdio` and `Streamable HTTP`. Both transports use JSON-RPC 2.0 for message exchange.\n' +
        '\n' +
        '## Supported Transport Protocols\n' +
        '\n' +
        'The MCP specification, specifically the `2025-03-26` revision, defines two primary transport mechanisms for client-server communication :\n' +
        '\n' +
        '1.  **`stdio` (Standard Input/Output)**: This transport involves the client launching the MCP server as a subprocess. The server reads JSON-RPC messages from its standard input (`stdin`) and sends messages to its standard output (`stdout`). Messages are delimited by newlines and must be UTF-8 encoded . This method is ideal for local processes .\n' +
        '\n' +
        '    The communication flow for `stdio` involves the client launching the server subprocess, and then exchanging messages by writing to `stdin` and reading from `stdout`. Optional logs can be sent via `stderr` .\n' +
        '\n' +
        '2.  **`Streamable HTTP`**: This transport allows the server to operate as an independent process capable of handling multiple client connections. It utilizes HTTP POST for sending messages from the client to the server and HTTP GET for the client to listen for messages from the server, optionally using Server-Sent Events (SSE) for streaming multiple server messages . This `Streamable HTTP` transport replaces the older `HTTP+SSE` transport from the `2024-11-05` protocol version .\n' +
        '\n' +
        '    *   **Sending Messages to the Server**: Clients send JSON-RPC messages as HTTP POST requests to a single MCP endpoint. The `Accept` header must include both `application/json` and `text/event-stream`. The server responds with either a single JSON object or initiates an SSE stream .\n' +
        '    *   **Listening for Messages from the Server**: Clients can issue an HTTP GET request to the MCP endpoint to open an SSE stream, allowing the server to send JSON-RPC requests and notifications to the client .\n' +
        '    *   **Session Management**: Servers can assign a session ID via an `Mcp-Session-Id` header during initialization, which clients must include in subsequent requests to maintain stateful sessions .\n' +
        '\n' +
        'Both transport mechanisms use JSON-RPC 2.0 to exchange messages .\n' +
        '\n' +
        '## Custom Transports\n' +
        '\n' +
        'The protocol is transport-agnostic, meaning clients and servers *may* implement additional custom transport mechanisms. However, any custom transport *must* preserve the JSON-RPC message format and lifecycle requirements defined by MCP .\n' +
        '\n' +
        '## Notes\n' +
        '\n' +
        'The information provided is based on the `2025-03-26` version of the MCP specification. The `SDK Implementations` wiki page also mentions `HttpClient SSE`, `WebFlux SSE`, and `WebMVC SSE` as specific transport implementations available in the Java SDK . These are specific implementations of the broader `Streamable HTTP` transport protocol.\n' +
        '\n' +
        'Wiki pages you might want to explore:\n' +
        '- [Protocol Specification (modelcontextprotocol/modelcontextprotocol)](/wiki/modelcontextprotocol/modelcontextprotocol#2)\n' +
        '- [SDK Implementations (modelcontextprotocol/modelcontextprotocol)](/wiki/modelcontextprotocol/modelcontextprotocol#3)\n' +
        '\n' +
        'View this search on DeepWiki: https://deepwiki.com/search/what-transport-protocols-does_c1cecf79-3c90-49ce-bd2b-6433e260abaf\n',
      arguments:
        '{"repoName":"modelcontextprotocol/modelcontextprotocol","question":"What transport protocols does the 2025-03-26 version of the MCP spec support?"}',
    },
  },
  {
    type: 'response.output_item.added',
    output_index: 2,
    item: { type: 'message' },
  },
  {
    type: 'response.content_part.added',
    sequence_number: 13,
    item_id: 'msg_6832bcd73b088191ac2652855844483906e699d7385bd583',
    output_index: 2,
    content_index: 0,
    part: { type: 'output_text', annotations: [], text: '' },
  },
  { type: 'response.output_text.delta', delta: 'This is' },
  { type: 'response.output_text.delta', delta: ' mock data.' },
  {
    type: 'response.output_text.done',
    sequence_number: 41,
    item_id: 'msg_6832bcd73b088191ac2652855844483906e699d7385bd583',
    output_index: 2,
    content_index: 0,
    text: 'The 2025-03-26 version of the MCP spec supports `stdio` and `Streamable HTTP` as transport protocols.',
  },
  {
    type: 'response.content_part.done',
    sequence_number: 42,
    item_id: 'msg_6832bcd73b088191ac2652855844483906e699d7385bd583',
    output_index: 2,
    content_index: 0,
    part: {
      type: 'output_text',
      annotations: [],
      text: 'The 2025-03-26 version of the MCP spec supports `stdio` and `Streamable HTTP` as transport protocols.',
    },
  },
  {
    type: 'response.output_item.done',
    output_index: 2,
    item: { type: 'message' },
  },
  {
    type: 'response.completed',
    response: {
      incomplete_details: null,
      usage: {
        input_tokens: 975,
        input_tokens_details: {
          cached_tokens: 0,
        },
        output_tokens: 75,
        output_tokens_details: {
          reasoning_tokens: 0,
        },
      },
    },
  },
];

const approvalChunks = [
  {
    type: 'response.created',
    response: {
      id: 'resp_6832c1705afc8191b527ce319dd45ddd0dff8ee355c8c6b6',
      created_at: 1748156784,
      model: 'gpt-4o-2024-08-06',
    },
  },
  {
    type: 'response.in_progress',
    sequence_number: 1,
    response: {
      id: 'resp_6832c1705afc8191b527ce319dd45ddd0dff8ee355c8c6b6',
      object: 'response',
      created_at: 1748156784,
      status: 'in_progress',
      background: false,
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model: 'gpt-4o-2024-08-06',
      output: [],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: {
        effort: null,
        summary: null,
      },
      service_tier: 'auto',
      store: true,
      temperature: 0,
      text: {
        format: {
          type: 'text',
        },
      },
      tool_choice: 'auto',
      tools: [
        {
          type: 'mcp',
          allowed_tools: ['ask_question'],
          headers: null,
          require_approval: {
            always: {
              tool_names: ['ask_question'],
            },
            never: {
              tool_names: [],
            },
          },
          server_label: 'deepwiki',
          server_url: 'https://mcp.deepwiki.com/<redacted>',
        },
      ],
      top_p: 1,
      truncation: 'disabled',
      usage: null,
      user: null,
      metadata: {},
    },
  },
  {
    type: 'response.output_item.added',
    sequence_number: 2,
    output_index: 0,
    item: {
      id: 'mcpl_6832c170bc6c81919499ec3e118425de0dff8ee355c8c6b6',
      type: 'mcp_list_tools',
      server_label: 'deepwiki',
      tools: [],
    },
  },
  {
    type: 'response.mcp_list_tools.in_progress',
    sequence_number: 3,
    output_index: 0,
    item_id: 'mcpl_6832c170bc6c81919499ec3e118425de0dff8ee355c8c6b6',
  },
  {
    type: 'response.mcp_list_tools.completed',
    sequence_number: 4,
    output_index: 0,
    item_id: 'mcpl_6832c170bc6c81919499ec3e118425de0dff8ee355c8c6b6',
  },
  {
    type: 'response.output_item.done',
    sequence_number: 5,
    output_index: 0,
    item: {
      id: 'mcpl_6832c170bc6c81919499ec3e118425de0dff8ee355c8c6b6',
      type: 'mcp_list_tools',
      server_label: 'deepwiki',
      tools: [
        {
          annotations: null,
          description: 'Ask any question about a GitHub repository',
          input_schema: {
            type: 'object',
            properties: {
              repoName: {
                type: 'string',
                description:
                  'GitHub repository: owner/repo (e.g. "facebook/react")',
              },
              question: {
                type: 'string',
                description: 'The question to ask about the repository',
              },
            },
            required: ['repoName', 'question'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
          name: 'ask_question',
        },
      ],
    },
  },
  {
    type: 'response.output_item.added',
    sequence_number: 6,
    output_index: 1,
    item: {
      id: 'mcpr_6832c17d6a948191947709fdbc6291240dff8ee355c8c6b6',
      type: 'mcp_approval_request',
      arguments:
        '{"repoName":"vercel-labs/ai","question":"What does the Vercel AI SDK do?"}',
      name: 'ask_question',
      server_label: 'deepwiki',
    },
  },
  {
    type: 'response.output_item.done',
    sequence_number: 7,
    output_index: 1,
    item: {
      id: 'mcpr_6832c17d6a948191947709fdbc6291240dff8ee355c8c6b6',
      type: 'mcp_approval_request',
      arguments:
        '{"repoName":"vercel-labs/ai","question":"What does the Vercel AI SDK do?"}',
      name: 'ask_question',
      server_label: 'deepwiki',
    },
  },
  {
    type: 'response.completed',
    response: {
      incomplete_details: null,
      usage: {
        input_tokens: 98,
        input_tokens_details: {
          cached_tokens: 0,
        },
        output_tokens: 37,
        output_tokens_details: {
          reasoning_tokens: 0,
        },
      },
    },
  },
];
