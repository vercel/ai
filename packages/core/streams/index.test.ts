import { setup } from '../tests/utils/mock-service'
import { OpenAIStream, StreamingTextResponse } from '.'
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
      expect(chunks).toMatchSnapshot()
      expect(server.getRecentFlushed()).toMatchSnapshot()
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
      expect(chunks).toMatchSnapshot()
      expect(server.getRecentFlushed()).toMatchSnapshot()
    })
  })
})
