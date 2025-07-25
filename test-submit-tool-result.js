const transportConfig = {
  prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => {
    switch (trigger) {
      case 'submit-user-message':
        return {
          body: {
            trigger: 'submit-user-message',
            id,
            message: messages[messages.length - 1],
            messageId,
          },
        };

      case 'submit-tool-result':
        return {
          body: {
            trigger: 'submit-tool-result',
            id,
            messages,
            messageId,
          },
        };

      case 'regenerate-assistant-message':
        return {
          body: {
            trigger: 'regenerate-assistant-message',
            id,
            messageId,
          },
        };
    }
  },
};

const apiRouteHandler = async req => {
  const { messages, trigger, messageId } = await req.json();

  switch (trigger) {
    case 'submit-user-message':
    case 'submit-tool-result':
      return streamText({
        model: 'gpt-4o',
        messages,
        tools: {
          weather: {
            description: 'Get weather information',
            inputSchema: z.object({
              location: z.string(),
            }),
            execute: async ({ location }) => {
              return { temperature: 72, conditions: 'sunny' };
            },
          },
        },
        stopWhen: stepCountIs(5), // Allow multiple steps
      });

    case 'regenerate-assistant-message':
      return streamText({
        model: 'gpt-4o',
        messages: messages.slice(0, -1),
        tools: {
          weather: {
            description: 'Get weather information',
            inputSchema: z.object({
              location: z.string(),
            }),
            execute: async ({ location }) => {
              return { temperature: 72, conditions: 'sunny' };
            },
          },
        },
        stopWhen: stepCountIs(5),
      });

    default:
      return new Response('Invalid trigger', { status: 400 });
  }
};

const wrongTransport = {
  prepareSendMessagesRequest: ({ trigger }) => {
    switch (trigger) {
      case 'submit-tool-result':
        throw new Error('submit-tool-result is not supported');
    }
  },
};

const incompleteTransport = {
  prepareSendMessagesRequest: ({ trigger, id, messageId }) => {
    switch (trigger) {
      case 'submit-tool-result':
        return {
          body: {
            trigger: 'submit-tool-result',
            id,
            messageId,
          },
        };
    }
  },
};

// 4. Debugging helper
const debugToolStates = messages => {
  messages.forEach((message, index) => {
    if (message.role === 'assistant') {
      console.log(`Message ${index} tool states:`);
      message.parts.forEach(part => {
        if (part.type === 'tool-invocation') {
          console.log(`  Tool ${part.toolName}: ${part.state}`);
          if (part.state === 'output-available') {
            console.log(`    Result: ${JSON.stringify(part.output)}`);
          }
        }
      });
    }
  });
};

const completeExample = {
  useChat: {
    transport: new DefaultChatTransport(transportConfig),
    maxSteps: 5,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === 'userConfirmation') {
        return 'User confirmed the action';
      }
    },
  },

  apiRoute: apiRouteHandler,

  debug: debugToolStates,
};

console.log('✅ submit-tool-result flow is properly configured');
console.log('Key points:');
console.log('1. Always handle submit-tool-result in transport');
console.log('2. Include complete messages array');
console.log('3. Use appropriate stopping conditions');
console.log('4. Ensure tool results are properly provided');
