// @ts-nocheck
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const google = createGoogleGenerativeAI({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const model = google('gemini-pro', {
  maxTokens: 1000
});

const embeddings = google('embedding-001');
