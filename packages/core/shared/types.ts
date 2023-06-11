/**
 * Shared types between the API and UI packages.
 */
export type Message = {
  id: string
  createdAt?: Date
  content: string
  role: 'system' | 'user' | 'assistant'
}

export type CreateMessage = {
  id?: string
  createdAt?: Date
  content: string
  role: 'system' | 'user' | 'assistant'
}
