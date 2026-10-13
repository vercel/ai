// @ts-nocheck
import openAIDefault, {
  OpenAI as OpenAIFacade,
  createOpenAI as makeOpenAI,
  openai,
  type OpenAIProviderSettings,
} from '@ai-sdk/openai';

const configured = new OpenAIFacade({});
const defaultModel = openai('model');
const settings: OpenAIProviderSettings = {};
