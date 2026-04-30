import { createAI } from '@ai-sdk/rsc';
import { type AIState, type UIState, submitUserMessage } from './actions';
import { generateId } from 'ai';

export const AI = createAI({
  actions: { submitUserMessage },
  initialUIState: [] as UIState,
  initialAIState: { chatId: generateId(), messages: [] } as AIState,
});
