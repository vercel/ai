// @ts-nocheck
import { Google } from '@ai-sdk/google';

const google = new Google({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const model = google.chat('gemini-pro', {
  maxTokens: 1000
});

const embeddings = google.textEmbedding('embedding-001');
