import { setup } from '../tests/utils/mock-service'
import { OpenAIStream, StreamingTextResponse } from '.'
import { createClient } from '../tests/utils/mock-client'

describe('AIStream', () => {
  let teardown: () => void
  let port: number
  let api: string
  beforeAll(() => {
    ;[port, teardown] = setup()
    api = `http://localhost:${port}`
  })
  afterAll(() => {
    teardown()
  })

  describe('OpenAIStream', () => {
    it('should be able to parse SSE and receive the streamed response', async () => {
      const stream = OpenAIStream(
        await fetch(api, {
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
    })
  })
})
