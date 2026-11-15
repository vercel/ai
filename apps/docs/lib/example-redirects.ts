/**
 * Legacy /examples redirects ported verbatim, in order, from the
 * production ai-sdk.dev app. Deep example URLs chain to their cookbook
 * (or docs) replacements exactly as they do on the live site; docs
 * content still links to many of these paths.
 */
export const exampleRedirects: {
  source: string;
  destination: string;
  permanent: boolean;
}[] = [
  {
    source: '/examples/node/tools/call-tool-in-parallel',
    destination: '/examples/node/tools/call-tools-in-parallel',
    permanent: true,
  },
  {
    source: '/examples/next-app/tools/call-function',
    destination: '/examples/next-app/tools/call-tool',
    permanent: true,
  },
  {
    source: '/examples/next-app/tools/call-functions-in-parallel',
    destination: '/examples/next-pages/tools/call-tools-in-parallel',
    permanent: true,
  },
  {
    source: '/examples/node/tools/call-function-in-parallel',
    destination: '/examples/node/tools/call-tools-in-parallel',
    permanent: true,
  },
  {
    source: '/examples/node/tools/call-function-with-image-prompt',
    destination: '/examples/node/tools/call-tool-with-image-prompt',
    permanent: true,
  },
  {
    source: '/examples/next-app/tools/render-interface-during-function-call',
    destination: '/examples/node/tools',
    permanent: true,
  },
  {
    source: '/examples/node/tools/call-function',
    destination: '/examples/node/tools/call-tool',
    permanent: true,
  },
  {
    source: '/examples/node/generating-structured-data/stream-object',
    destination: '/examples/node/generating-structured-data/generate-object',
    permanent: true,
  },
  {
    source: '/examples/next-app/chat/use-chat-image-input',
    destination: '/examples/next-app/chat',
    permanent: true,
  },
  {
    source: '/examples/next-app',
    destination: '/examples/next',
    permanent: false,
  },
  {
    source: '/examples/next-pages',
    destination: '/examples/next',
    permanent: false,
  },
  {
    source: '/examples/next-pages/basics',
    destination: '/examples/next/basics',
    permanent: false,
  },
  {
    source: '/examples/next-pages/basics/generating-text',
    destination: '/examples/next/basics/generating-text',
    permanent: false,
  },
  {
    source: '/examples/next-pages/basics/streaming-text-generation',
    destination: '/examples/next/basics/streaming-text-generation',
    permanent: false,
  },
  {
    source: '/examples/next-pages/basics/generating-object',
    destination: '/examples/next/basics/generating-object',
    permanent: false,
  },
  {
    source: '/examples/next-pages/basics/streaming-object-generation',
    destination: '/examples/next/basics/streaming-object-generation',
    permanent: false,
  },
  {
    source: '/examples/next-pages/chat',
    destination: '/examples/next/chat',
    permanent: false,
  },
  {
    source: '/examples/next-pages/chat/generate-chat-completion',
    destination: '/examples/next/chat/generate-chat-completion',
    permanent: false,
  },
  {
    source: '/examples/next-pages/chat/stream-chat-completion',
    destination: '/examples/next/chat/stream-chat-completion',
    permanent: false,
  },
  {
    source: '/examples/next-pages/chat/use-chat-image-input',
    destination: '/examples/next/chat/use-chat-image-input',
    permanent: false,
  },
  {
    source: '/examples/next-pages/chat/use-chat-custom-body',
    destination: '/examples/next/chat/use-chat-custom-body',
    permanent: false,
  },
  {
    source: '/examples/next-pages/tools',
    destination: '/examples/next/tools',
    permanent: false,
  },
  {
    source: '/examples/next-pages/tools/call-tool',
    destination: '/examples/next/tools/call-tool',
    permanent: false,
  },
  {
    source: '/examples/next-pages/tools/call-tools-in-parallel',
    destination: '/examples/next/tools/call-tools-in-parallel',
    permanent: false,
  },
  {
    source: '/examples/next-pages/tools/render-interface-during-tool-call',
    destination: '/examples/next/tools/render-interface-during-tool-call',
    permanent: false,
  },
  {
    source: '/examples/next-pages/state-management',
    destination: '/examples/next/state-management',
    permanent: false,
  },
  {
    source: '/examples/next-pages/state-management/save-messages',
    destination: '/examples/next/state-management/save-messages',
    permanent: false,
  },
  {
    source: '/examples/next-pages/state-management/restore-messages',
    destination: '/examples/next/state-management/restore-messages',
    permanent: false,
  },
  {
    source: '/examples/next-pages/interface',
    destination: '/examples/next/interface',
    permanent: false,
  },
  {
    source: '/examples/next-pages/interface/route-components',
    destination: '/examples/next/interface/route-components',
    permanent: false,
  },
  {
    source: '/examples/next-pages/assistants',
    destination: '/examples/next/assistants',
    permanent: false,
  },
  {
    source: '/examples/next-pages/assistants/stream-assistant-responses',
    destination: '/examples/next/assistants/stream-assistant-responses',
    permanent: false,
  },
  {
    source:
      '/examples/next-pages/assistants/stream-assistant-responses-with-tools',
    destination:
      '/examples/next/assistants/stream-assistant-responses-with-tools',
    permanent: false,
  },
  {
    source: '/examples/next-app/basics',
    destination: '/examples/rsc/basics',
    permanent: false,
  },
  {
    source: '/examples/next-app/basics/generating-text',
    destination: '/examples/rsc/basics/generating-text',
    permanent: false,
  },
  {
    source: '/examples/next-app/basics/streaming-text-generation',
    destination: '/examples/rsc/basics/streaming-text-generation',
    permanent: false,
  },
  {
    source: '/examples/next-app/basics/generating-object',
    destination: '/examples/rsc/basics/generating-object',
    permanent: false,
  },
  {
    source: '/examples/next-app/basics/streaming-object-generation',
    destination: '/examples/rsc/basics/streaming-object-generation',
    permanent: false,
  },
  {
    source: '/examples/next-app/chat',
    destination: '/examples/rsc/chat',
    permanent: false,
  },
  {
    source: '/examples/next-app/chat/generate-chat-completion',
    destination: '/examples/rsc/chat/generate-chat-completion',
    permanent: false,
  },
  {
    source: '/examples/next-app/chat/stream-chat-completion',
    destination: '/examples/rsc/chat/stream-chat-completion',
    permanent: false,
  },
  {
    source: '/examples/next-app/tools',
    destination: '/examples/rsc/tools',
    permanent: false,
  },
  {
    source: '/examples/next-app/tools/call-tool',
    destination: '/examples/rsc/tools/call-tool',
    permanent: false,
  },
  {
    source: '/examples/next-app/tools/call-tools-in-parallel',
    destination: '/examples/rsc/tools/call-tools-in-parallel',
    permanent: false,
  },
  {
    source: '/examples/next-app/tools/render-interface-during-tool-call',
    destination: '/examples/rsc/tools/render-interface-during-tool-call',
    permanent: false,
  },
  {
    source: '/examples/next-app/state-management',
    destination: '/examples/rsc/state-management',
    permanent: false,
  },
  {
    source: '/examples/next-app/state-management/ai-ui-states',
    destination: '/examples/rsc/state-management/ai-ui-states',
    permanent: false,
  },
  {
    source: '/examples/next-app/state-management/save-and-restore-states',
    destination: '/examples/rsc/state-management/save-and-restore-states',
    permanent: false,
  },
  {
    source: '/examples/next-app/interface',
    destination: '/examples/rsc/interface',
    permanent: false,
  },
  {
    source: '/examples/next-app/interface/route-components',
    destination: '/examples/rsc/interface/route-components',
    permanent: false,
  },
  {
    source: '/examples/next-app/interface/stream-component-updates',
    destination: '/examples/rsc/interface/stream-component-updates',
    permanent: false,
  },
  {
    source: '/examples/next-app/interface/token-usage',
    destination: '/examples/rsc/interface/token-usage',
    permanent: false,
  },
  {
    source: '/examples/next-app/assistants',
    destination: '/examples/rsc/assistants',
    permanent: false,
  },
  {
    source: '/examples/next-app/assistants/stream-assistant-responses',
    destination: '/examples/rsc/assistants/stream-assistant-responses',
    permanent: false,
  },
  {
    source:
      '/examples/next-app/assistants/stream-assistant-responses-with-tools',
    destination:
      '/examples/rsc/assistants/stream-assistant-responses-with-tools',
    permanent: false,
  },
  {
    source: '/examples',
    destination: '/cookbook',
    permanent: false,
  },
  {
    source: '/examples/next',
    destination: '/cookbook/next/generate-text',
    permanent: false,
  },
  {
    source: '/examples/next/basics',
    destination: '/cookbook/next/generate-text',
    permanent: false,
  },
  {
    source: '/examples/next/basics/generating-text',
    destination: '/cookbook/next/generate-text',
    permanent: false,
  },
  {
    source: '/examples/next/basics/streaming-text-generation',
    destination: '/cookbook/next/stream-text',
    permanent: false,
  },
  {
    source: '/examples/next/basics/generating-object',
    destination: '/cookbook/next/generate-object',
    permanent: false,
  },
  {
    source: '/examples/next/basics/streaming-object-generation',
    destination: '/cookbook/next/stream-object',
    permanent: false,
  },
  {
    source: '/examples/next/chat',
    destination: '/cookbook/next/generate-text-with-chat-prompt',
    permanent: false,
  },
  {
    source: '/examples/next/chat/generate-chat-completion',
    destination: '/cookbook/next/generate-text-with-chat-prompt',
    permanent: false,
  },
  {
    source: '/examples/next/chat/stream-chat-completion',
    destination: '/cookbook/next/stream-text-with-chat-prompt',
    permanent: false,
  },
  {
    source: '/examples/next/chat/use-chat-image-input',
    destination: '/cookbook/next/stream-text-with-image-prompt',
    permanent: false,
  },
  {
    source: '/examples/next/chat/use-chat-custom-body',
    destination: '/cookbook/next/send-custom-body-from-use-chat',
    permanent: false,
  },
  {
    source: '/examples/next/tools',
    destination: '/cookbook/next/call-tools',
    permanent: false,
  },
  {
    source: '/examples/next/tools/call-tool',
    destination: '/cookbook/next/call-tools',
    permanent: false,
  },
  {
    source: '/examples/next/tools/call-tools-in-parallel',
    destination: '/cookbook/next/call-tools-in-parallel',
    permanent: false,
  },
  {
    source: '/examples/next/tools/render-interface-during-tool-call',
    destination: '/cookbook/next/render-visual-interface-in-chat',
    permanent: false,
  },
  {
    source: '/examples/next/state-management',
    destination: '/docs/ai-sdk-ui/chatbot-message-persistence',
    permanent: false,
  },
  {
    source: '/examples/next/state-management/save-messages',
    destination: '/docs/ai-sdk-ui/chatbot-message-persistence',
    permanent: false,
  },
  {
    source: '/examples/next/state-management/restore-messages',
    destination: '/docs/ai-sdk-ui/chatbot-message-persistence',
    permanent: false,
  },
  {
    source: '/examples/next/interface',
    destination: '/cookbook/next/render-visual-interface-in-chat',
    permanent: false,
  },
  {
    source: '/examples/next/interface/route-components',
    destination: '/cookbook/next/render-visual-interface-in-chat',
    permanent: false,
  },
  {
    source: '/examples/next/assistants',
    destination: '/cookbook/next/stream-assistant-response',
    permanent: false,
  },
  {
    source: '/examples/next/assistants/stream-assistant-responses',
    destination: '/cookbook/next/stream-assistant-response',
    permanent: false,
  },
  {
    source: '/examples/next/assistants/stream-assistant-responses-with-tools',
    destination: '/cookbook/next/stream-assistant-response-with-tools',
    permanent: false,
  },
  {
    source: '/examples/node',
    destination: '/cookbook/node/generate-text',
    permanent: false,
  },
  {
    source: '/examples/node/generating-text',
    destination: '/cookbook/node/generate-text',
    permanent: false,
  },
  {
    source: '/examples/node/generating-text/generate-text',
    destination: '/cookbook/node/generate-text',
    permanent: false,
  },
  {
    source: '/examples/node/generating-text/stream-text',
    destination: '/cookbook/node/stream-text',
    permanent: false,
  },
  {
    source: '/examples/node/generating-text/generate-text-with-chat-prompt',
    destination: '/cookbook/node/generate-text-with-chat-prompt',
    permanent: false,
  },
  {
    source: '/examples/node/generating-text/stream-text-with-chat-prompt',
    destination: '/cookbook/node/stream-text-with-chat-prompt',
    permanent: false,
  },
  {
    source: '/examples/node/generating-text/generate-text-with-image-prompt',
    destination: '/cookbook/node/generate-text-with-image-prompt',
    permanent: false,
  },
  {
    source: '/examples/node/generating-text/rag',
    destination: '/cookbook/node/retrieval-augmented-generation',
    permanent: false,
  },
  {
    source: '/examples/node/generating-structured-data',
    destination: '/cookbook/node/generate-object',
    permanent: false,
  },
  {
    source: '/examples/node/generating-structured-data/generate-object',
    destination: '/cookbook/node/generate-object',
    permanent: false,
  },
  {
    source: '/examples/node/generating-structured-data/add-images-to-prompt',
    destination: '/cookbook/node/stream-object-with-image-prompt',
    permanent: false,
  },
  {
    source: '/examples/node/streaming-structured-data',
    destination: '/cookbook/node/stream-object',
    permanent: false,
  },
  {
    source: '/examples/node/streaming-structured-data/stream-object',
    destination: '/cookbook/node/stream-object',
    permanent: false,
  },
  {
    source: '/examples/node/streaming-structured-data/token-usage',
    destination: '/cookbook/node/stream-object-record-token-usage',
    permanent: false,
  },
  {
    source: '/examples/node/streaming-structured-data/object',
    destination: '/cookbook/node/stream-object-record-final-object',
    permanent: false,
  },
  {
    source: '/examples/node/tools',
    destination: '/cookbook/node/call-tools',
    permanent: false,
  },
  {
    source: '/examples/node/tools/call-tool',
    destination: '/cookbook/node/call-tools',
    permanent: false,
  },
  {
    source: '/examples/node/tools/call-tool-with-image-prompt',
    destination: '/cookbook/node/call-tools-with-image-prompt',
    permanent: false,
  },
  {
    source: '/examples/node/tools/call-tools-in-parallel',
    destination: '/cookbook/node/call-tools-in-parallel',
    permanent: false,
  },
  {
    source: '/examples/node/tools/call-tools-with-automatic-roundtrips',
    destination: '/cookbook/node/call-tools-multiple-steps',
    permanent: false,
  },
  {
    source: '/examples/rsc',
    destination: '/cookbook/rsc/generate-text',
    permanent: false,
  },
  {
    source: '/examples/rsc/generating-text',
    destination: '/cookbook/rsc/generate-text',
    permanent: false,
  },
  {
    source: '/examples/rsc/basics/generating-text',
    destination: '/cookbook/rsc/generate-text',
    permanent: false,
  },
  {
    source: '/examples/rsc/basics/streaming-text-generation',
    destination: '/cookbook/rsc/stream-text',
    permanent: false,
  },
  {
    source: '/examples/rsc/basics/generating-object',
    destination: '/cookbook/rsc/generate-object',
    permanent: false,
  },
  {
    source: '/examples/rsc/basics/streaming-object-generation',
    destination: '/cookbook/rsc/stream-object',
    permanent: false,
  },
  {
    source: '/examples/rsc/chat',
    destination: '/cookbook/rsc/generate-text-with-chat-prompt',
    permanent: false,
  },
  {
    source: '/examples/rsc/chat/generate-chat-completion',
    destination: '/cookbook/rsc/generate-text-with-chat-prompt',
    permanent: false,
  },
  {
    source: '/examples/rsc/chat/stream-chat-completion',
    destination: '/cookbook/rsc/stream-text-with-chat-prompt',
    permanent: false,
  },
  {
    source: '/examples/rsc/tools',
    destination: '/cookbook/rsc/generate-text',
    permanent: false,
  },
  {
    source: '/examples/rsc/tools/call-tool',
    destination: '/cookbook/rsc/call-tools',
    permanent: false,
  },
  {
    source: '/examples/rsc/tools/call-tools-in-parallel',
    destination: '/cookbook/rsc/call-tools-in-parallel',
    permanent: false,
  },
  {
    source: '/examples/rsc/tools/render-interface-during-tool-call',
    destination: '/cookbook/rsc/render-visual-interface-in-chat',
    permanent: false,
  },
  {
    source: '/examples/rsc/state-management',
    destination: '/cookbook/rsc/save-messages-to-database',
    permanent: false,
  },
  {
    source: '/examples/rsc/state-management/ai-ui-states',
    destination: '/docs/ai-sdk-rsc/generative-ui-state#what-is-ai-and-ui-state',
    permanent: false,
  },
  {
    source: '/examples/rsc/state-management/save-and-restore-states',
    destination: '/cookbook/rsc/save-messages-to-database',
    permanent: false,
  },
  {
    source: '/examples/rsc/interface',
    destination: '/cookbook/rsc/render-visual-interface-in-chat',
    permanent: false,
  },
  {
    source: '/examples/rsc/interface/route-components',
    destination: '/cookbook/rsc/render-visual-interface-in-chat',
    permanent: false,
  },
  {
    source: '/examples/rsc/interface/stream-component-updates',
    destination: '/cookbook/rsc/stream-updates-to-visual-interfaces',
    permanent: false,
  },
  {
    source: '/examples/rsc/interface/token-usage',
    destination: '/cookbook/rsc/stream-ui-record-token-usage',
    permanent: false,
  },
  {
    source: '/examples/rsc/assistants',
    destination: '/cookbook/rsc/stream-assistant-response',
    permanent: false,
  },
  {
    source: '/examples/rsc/assistants/stream-assistant-responses',
    destination: '/cookbook/rsc/stream-assistant-response',
    permanent: false,
  },
  {
    source: '/examples/rsc/assistants/stream-assistant-responses-with-tools',
    destination: '/cookbook/rsc/stream-assistant-response-with-tools',
    permanent: false,
  },
  {
    source: '/examples/api-servers',
    destination: '/cookbook/api-servers/node-http-server',
    permanent: false,
  },
  {
    source: '/examples/api-servers/node-js-http-server',
    destination: '/cookbook/api-servers/node-http-server',
    permanent: false,
  },
  {
    source: '/examples/api-servers/express',
    destination: '/cookbook/api-servers/express',
    permanent: false,
  },
  {
    source: '/examples/api-servers/hono',
    destination: '/cookbook/api-servers/hono',
    permanent: false,
  },
  {
    source: '/examples/api-servers/fastify',
    destination: '/cookbook/api-servers/fastify',
    permanent: false,
  },
  {
    source: '/examples/api-servers/nest',
    destination: '/cookbook/api-servers/nest',
    permanent: false,
  },
  {
    source: '/examples/providers',
    destination: '/cookbook/node/intercept-fetch-requests',
    permanent: false,
  },
  {
    source: '/examples/providers/intercepting-fetch-requests',
    destination: '/cookbook/node/intercept-fetch-requests',
    permanent: false,
  },
  {
    source: '/examples/next-app/assistants/function',
    destination: '/cookbook/next/stream-assistant-response-with-tools',
    permanent: true,
  },
  {
    source: '/examples/next-app/state-management/actions',
    destination: '/cookbook/next/save-messages-to-database',
    permanent: true,
  },
  {
    source: '/examples/next-app/state-management/ai',
    destination: '/cookbook/next/save-messages-to-database',
    permanent: true,
  },
  {
    source: '/examples/next-pages/basics/api/use-object/schema',
    destination: '/cookbook/next/generate-object',
    permanent: true,
  },
  {
    source: '/examples/next-pages/basics/schema',
    destination: '/cookbook/next/generate-text',
    permanent: true,
  },
  {
    source: '/examples/next/basics/schema',
    destination: '/cookbook/next/generate-text',
    permanent: true,
  },
  {
    source: '/examples/rsc/assistants/ai',
    destination: '/cookbook/rsc/stream-assistant-response',
    permanent: true,
  },
  {
    source: '/examples/rsc/assistants/function',
    destination: '/cookbook/rsc/stream-assistant-response',
    permanent: true,
  },
  {
    source: '/examples/rsc/assistants/message',
    destination: '/cookbook/rsc/stream-assistant-response',
    permanent: true,
  },
  {
    source: '/examples/rsc/basics',
    destination: '/cookbook/rsc/generate-text',
    permanent: true,
  },
  {
    source: '/examples/rsc/basics/actions',
    destination: '/cookbook/rsc/generate-text',
    permanent: true,
  },
  {
    source: '/examples/rsc/chat/actions',
    destination: '/cookbook/rsc/stream-text-with-chat-prompt',
    permanent: true,
  },
  {
    source: '/examples/rsc/interface/actions',
    destination: '/cookbook/rsc/render-visual-interface-in-chat',
    permanent: true,
  },
  {
    source: '/examples/rsc/state-management/ai',
    destination: '/cookbook/rsc/save-messages-to-database',
    permanent: true,
  },
  {
    source: '/examples/rsc/tools/actions',
    destination: '/cookbook/rsc/call-tools',
    permanent: true,
  },
];
