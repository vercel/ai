# AI SDK Web Fetch Tool

A first-party, provider-independent web fetch tool for the [AI SDK](https://ai-sdk.dev/docs).

The `@ai-sdk/tool-web-fetch` entry point provides a web fetch tool for any model
supporting function calling. The model calls it with a URL and receives the
page content: HTML pages are converted to markdown with the main content
extracted, and text formats such as markdown, JSON, and XML are returned as is.

## Installation

```sh
pnpm add ai @ai-sdk/tool-web-fetch
```

Requires Node.js 22.13 or newer.

## Usage

```ts
import { experimental_createWebFetchTool as createWebFetchTool } from '@ai-sdk/tool-web-fetch';
import { generateText, isStepCount } from 'ai';

const result = await generateText({
  model, // Your configured model with function calling support.
  tools: { webFetch: createWebFetchTool() },
  stopWhen: isStepCount(5),
  prompt: 'Summarize https://ai-sdk.dev/docs/introduction.',
});

console.log(result.text);
```

The model calls the tool with `{ url, offset? }`. Long content is truncated to
`maxLength` characters, and the model can continue reading with `offset`.
Failures such as HTTP errors, blocked URLs, or unsupported content types are
returned as results, so the model can recover.

Requests prefer markdown (`Accept: text/markdown`) and fall back to converting
HTML with [defuddle](https://github.com/kepano/defuddle). JavaScript is not
executed, so pages that render their content in the browser may return little
or no content.

## Security

The tool makes GET requests without cookies or credentials. Every request and
redirect is checked against private and reserved addresses, and on Node.js
resolved DNS addresses are validated at connect time. On other runtimes, only
the URL is validated; restrict network egress at the platform level.

Use `allowedDomains` or `blockedDomains` to restrict which sites can be
fetched. Set `requireUrlInUserMessage` to only fetch URLs that appear in user
messages, which prevents the model from fetching URLs it constructed itself,
for example to exfiltrate data in a query string. Links found in tool results,
such as search results or fetched pages, cannot be followed in this mode.

Fetched content is untrusted and can contain prompt injections.

## Options

| Option                    | Default          | Description                                                                                        |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| `allowedDomains`          | none             | Only fetch from these domains and their subdomains. Cannot be combined with `blockedDomains`.      |
| `blockedDomains`          | none             | Never fetch from these domains or their subdomains.                                                |
| `requireUrlInUserMessage` | `false`          | Only fetch URLs that appear in user messages.                                                      |
| `maxLength`               | `50000`          | Maximum characters returned per call.                                                              |
| `maxBytes`                | 10 MiB           | Maximum response size in bytes.                                                                    |
| `timeout`                 | `30000`          | Timeout in milliseconds for fetching each URL, including redirects.                                |
| `fetch`                   | DNS-pinned fetch | Custom fetch implementation, e.g. for a proxy. It must validate resolved addresses itself.         |
| `defuddleOptions`         | none             | Options for the HTML content extractor, e.g. `contentSelector` to choose the main content element. |

See the [Web Fetch Tool documentation](https://ai-sdk.dev/docs/ai-sdk-core/tools#web-fetch-tool)
for details.
