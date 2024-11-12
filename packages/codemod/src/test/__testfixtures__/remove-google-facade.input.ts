// @ts-nocheck
import { Google } from '@ai-sdk/google';

const google = new Google({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const model = google.generativeAI('gemini-pro');
const otherModel = google.chat('other-gemini-pro');
