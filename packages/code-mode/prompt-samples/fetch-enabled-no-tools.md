Execute code-mode TypeScript in an isolated sandbox.

Put the full program in `js`; top-level `await`/`return` work. Return a JSON-serializable result.
Call host tools only as async `tools.name(input)`; await each or use `Promise.all` for independent calls.
Use exact names/types below. `JSON.parse`/`JSON.stringify` are available.
Fetch: `fetch` is available; policy: no origins or URL prefixes allowed; methods=`GET`, `HEAD`; maxBody=1048576; redirects=none.

Tools:
No host tools. Do not call `tools.*`.
