export const createClient = (response: Response) => {
  return {
    async readAll() {
      if (!response.body) {
        throw new Error('Response body is not readable')
      }

      let chunks: string[] = []
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        chunks.push(new TextDecoder().decode(value))
      }
      return chunks
    }
  }
}
