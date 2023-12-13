export class InkeepApiClient {
  private basePath: string;
  private apiKey: string;

  constructor(apiKey: string, basePath = 'https://api.inkeep.com/v0') {
    this.apiKey = apiKey;
    this.basePath = basePath;
  }

  async fetch({
    path,
    body,
    options = {},
  }: {
    path: string;
    body?: object;
    options?: RequestInit;
  }) {
    const url = `${this.basePath}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...(options.headers || {}),
    };
    const bodyContent = body ? JSON.stringify(body) : undefined;
    return fetch(url, { ...options, headers, body: bodyContent });
  }
}
