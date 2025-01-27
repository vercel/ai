// @ts-nocheck
import { CoreMessage, CoreUserMessage, CoreAssistantMessage, ToolMessage } from 'ai';

function processMessage(message: CoreMessage) {
  console.log(message);
}

function handleUser(msg: CoreUserMessage) {
  console.log(msg);
}

const assistant: CoreAssistantMessage = {
  role: 'assistant',
  content: 'Hello'
};

type ToolHandler = (msg: ToolMessage) => void;
