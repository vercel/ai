import { setup } from '../tests/utils/mock-service'
import { createClient } from '../tests/utils/mock-client'

describe('AIStream', () => {
  let server: ReturnType<typeof setup>
  beforeAll(() => {
    server = setup()
  })
  afterAll(() => {
    server.teardown()
  })

  describe('OpenAIStream', () => {
    if (typeof Response === 'undefined') {
      it("should skip this test on Node 16 because it doesn't support `Response`", () => {})
    } else {
      const { OpenAIStream, StreamingTextResponse } =
        require('.') as typeof import('.')

      it('should be able to parse SSE and receive the streamed response', async () => {
        const stream = OpenAIStream(
          await fetch(server.api, {
            headers: {
              'x-mock-service': 'openai',
              'x-mock-type': 'chat'
            }
          })
        )
        const response = new StreamingTextResponse(stream)
        const client = createClient(response)
        const chunks = await client.readAll()
        expect(JSON.stringify(chunks)).toMatchInlineSnapshot(
          `"["Hello",","," world","."]"`
        )
        expect(JSON.stringify(server.getRecentFlushed())).toMatchInlineSnapshot(
          `"[{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"role":"assistant"},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":","},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" world"},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":"."},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}]"`
        )
      })

      it('should handle backpressure on the server', async () => {
        const controller = new AbortController()
        const stream = OpenAIStream(
          await fetch(server.api, {
            headers: {
              'x-mock-service': 'openai',
              'x-mock-type': 'chat'
            },
            signal: controller.signal
          })
        )
        const response = new StreamingTextResponse(stream)
        const client = createClient(response)
        const chunks = await client.readAndAbort(controller)
        expect(JSON.stringify(chunks)).toMatchInlineSnapshot(`"["Hello"]"`)
        expect(JSON.stringify(server.getRecentFlushed())).toMatchInlineSnapshot(
          `"[{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"role":"assistant"},"index":0,"finish_reason":null}]},{"id":"chatcmpl-7RyNSW2BXkOQQh7NlBc65j5kX8AjC","object":"chat.completion.chunk","created":1686901302,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}]"`
        )
      })
    }
  })
})
