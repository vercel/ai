// @ts-nocheck
import { useChat } from '@ai-sdk/react';

export function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
  });

  const handleChange = handleInputChange;
  const currentInput = input;
}

export function AnotherComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    onError: (error) => console.error(error),
  });

  const submitHandler = handleSubmit;
  const onChange = handleInputChange;
  return { input, onChange, submitHandler };
}

export function ComponentWithAlias() {
  const {
    messages,
    input: chatInput,
    handleInputChange: handleChatInputChange,
    handleSubmit
  } = useChat();

  const value = chatInput;
  const handler = handleChatInputChange;
  return { value, handler };
}

export function PartialExtraction() {
  const { input, handleSubmit } = useChat({
    api: '/api/chat',
  });

  return input;
}

export function OnlyHandleInputChange() {
  const { messages, handleInputChange } = useChat();
  return handleInputChange;
}