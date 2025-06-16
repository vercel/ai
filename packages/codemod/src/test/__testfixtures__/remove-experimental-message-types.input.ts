// @ts-nocheck
import { ExperimentalMessage, ExperimentalUserMessage, ExperimentalAssistantMessage, ExperimentalToolMessage } from 'ai';

function processMessage(message: ExperimentalMessage) {
  console.log(message);
}

function handleUser(msg: ExperimentalUserMessage) {
  console.log(msg);
}

const assistant: ExperimentalAssistantMessage = {
  role: 'assistant',
  content: 'Hello'
};

type ToolHandler = (msg: ExperimentalToolMessage) => void;
