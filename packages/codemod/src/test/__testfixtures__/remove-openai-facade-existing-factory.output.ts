// @ts-nocheck
import openAIDefault, { createOpenAI as makeOpenAI, openai, type OpenAIProviderSettings } from '@ai-sdk/openai';

const configured = makeOpenAI({});
const defaultModel = openai('model');
const settings: OpenAIProviderSettings = {};
