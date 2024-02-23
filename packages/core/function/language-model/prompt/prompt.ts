import { ChatPrompt } from './chat-prompt';
import { InstructionPrompt } from './instruction-prompt';

export type LanguageModelPrompt = string | InstructionPrompt | ChatPrompt;
