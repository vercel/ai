// @ts-nocheck
import { OpenAI, openai } from '@ai-sdk/openai';

const configured = new OpenAI({});
const defaultModel = openai('model');
