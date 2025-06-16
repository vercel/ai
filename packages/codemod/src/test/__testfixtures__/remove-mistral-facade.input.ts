// @ts-nocheck
import { Mistral } from '@ai-sdk/mistral';

const mistral = new Mistral({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});
