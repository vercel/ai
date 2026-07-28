Execute code-mode TypeScript in an isolated sandbox.

Put the full program in `js`; top-level `await`/`return` work. Return a JSON-serializable result.
Call host tools only as async `tools.name(input)`; await each or use `Promise.all` for independent calls.
Use exact names/types below. `JSON.parse`/`JSON.stringify` are available.
Fetch: `fetch` is available; policy: origins=`https://api.example.test`; prefixes=`https://docs.example.test/public`, `https://files.example.test/assets/`; methods=`GET`, `POST`; maxBody=4096; redirects=same-policy,max=10.

Tools:
No host tools. Do not call `tools.*`.
