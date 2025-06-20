// @ts-nocheck
import { useChat } from 'ai/react';
import { useChat as useOtherChat } from 'other-package/react';
import { useChat as useAISDKChat } from '@ai-sdk/react';

export default function App() {
  const { messages: aiMessages } = useChat();
  const { messages: otherMessages } = useOtherChat();
  const { messages: aiSdkMessages } = useAISDKChat();

  return (
    <div>
      <p>AI Messages: {aiMessages.length}</p>
      <p>Other Messages: {otherMessages.length}</p>
      <p>AI SDK Messages: {aiSdkMessages.length}</p>
    </div>
  );
} 