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
curl -i -X POST http://127.0.0.1:3001/workflow/helloworld-completion/start \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, world!"}'
```

```sh
curl -i -X POST http://127.0.0.1:3001/workflow/routing-chatbot/start \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Write a blog post about Berlin."}]}'
```

```sh
curl -i -X POST http://127.0.0.1:3001/workflow/writer-delayed/start \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a blog post about Berlin."}'
```

```sh
curl -i -X GET http://127.0.0.1:3001/run/123/stream
```
