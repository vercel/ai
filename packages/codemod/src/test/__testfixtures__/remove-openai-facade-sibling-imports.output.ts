// @ts-nocheck
import { createOpenAI, openai } from '@ai-sdk/openai';

const configured = createOpenAI({});
const defaultModel = openai('model');
