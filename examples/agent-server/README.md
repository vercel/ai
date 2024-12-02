## Agent Server Examples

### Build

```sh
pnpm build-watch
```

### Start

```sh
pnpm start
```

### Snippets

```sh
curl -X POST http://127.0.0.1:3001/agent/helloworld-completion/start \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, world!"}'
```
