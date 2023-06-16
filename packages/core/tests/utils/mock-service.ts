import { ServerResponse, createServer } from 'node:http'

import Snapshot_OpenAIChat from '../snapshots/openai-chat'

async function flushDataToResponse(
  res: ServerResponse,
  data: object[],
  suffix?: string
) {
  for (const item of data) {
    res.write(`data: ${JSON.stringify(item)}\n\n`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (suffix) {
    res.write(`data: ${suffix}\n\n`)
  }
}

export const setup = () => {
  const server = createServer((req, res) => {
    const service = req.headers['x-mock-service'] || 'openai'
    const type = req.headers['x-mock-type'] || 'chat'

    switch (type) {
      case 'chat':
        switch (service) {
          case 'openai':
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive'
            })
            res.flushHeaders()
            flushDataToResponse(res, Snapshot_OpenAIChat, '[DONE]')
            break
          default:
            throw new Error(`Unknown service: ${service}`)
        }
        break
      default:
        throw new Error(`Unknown type: ${type}`)
    }
  })

  server.listen(3030)

  return [
    3030,
    () => {
      server.close()
    }
  ] as const
}
