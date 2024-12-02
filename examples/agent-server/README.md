## Agent Server Examples

### Start

```sh
pnpm build-watch
```

### Snippets

```sh
curl -X POST http://127.0.0.1:3000/agent/helloworld-completion/start \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, world!"}'
```
