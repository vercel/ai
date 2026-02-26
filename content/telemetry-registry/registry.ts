// CONTRIBUTING GUIDE
// https://github.com/vercel/ai/blob/main/contributing/add-new-telemetry-handler-to-registry.md

export interface TelemetryHandlerEntry {
  slug: string;
  name: string;
  description: string;
  packageName: string;
  tags?: string[];
  apiKeyEnvName?: string;
  installCommand: {
    pnpm: string;
    npm: string;
    yarn: string;
    bun: string;
  };
  codeExample: string;
  docsUrl?: string;
  apiKeyUrl?: string;
  websiteUrl?: string;
  npmUrl?: string;
}

export const telemetryHandlers: TelemetryHandlerEntry[] = [];
