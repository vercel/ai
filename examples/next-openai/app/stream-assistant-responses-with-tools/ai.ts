import { createAI } from 'ai/rsc';
import { submitMessage } from './actions';

export const AI = createAI({
  actions: {
    submitMessage,
  },
  initialAIState: [],
  initialUIState: [],
});
