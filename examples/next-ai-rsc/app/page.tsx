'use client'

import { useEffect, useRef, useState } from 'react'

import { useUIState, useActions, useAIState } from 'ai-njkcad81/rsc'
import { UserMessage } from '@/components/llm-stocks/message'

import { type AI } from './action'
import { ChatScrollAnchor } from '@/lib/hooks/chat-scroll-anchor'
import { FooterText } from '@/components/footer'
import Textarea from 'react-textarea-autosize'
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { IconArrowElbow, IconPlus } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { ChatList } from '@/components/chat-list'
import { EmptyScreen } from '@/components/empty-screen'
import { toast } from '@/components/ui/use-toast'

export default function Page() {
  const [messages, setMessages] = useUIState<typeof AI>()
  const { submitUserMessage } = useActions()
  const [inputValue, setInputValue] = useState('')
  const { formRef, onKeyDown } = useEnterSubmit()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/') {
        if (e.target && ['INPUT', 'TEXTAREA'].includes((e.target as any).nodeName)) {
          return
        }
        e.preventDefault()
        e.stopPropagation()
        if (inputRef?.current) {
          inputRef.current.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [inputRef])

  return (
    <div>
      <div className="pb-[200px] pt-4 md:pt-10">
        {messages.length ? (
          <>
            <ChatList messages={messages} />
          </>
        ) : (
          <EmptyScreen
            submitMessage={async (message) => {
              // Add user message UI
              setMessages((currentMessages) => [
                ...currentMessages,
                {
                  id: Date.now(),
                  display: <UserMessage>{message}</UserMessage>,
                },
              ])

              // Submit and get response message
              const responseMessage = await submitUserMessage(message)
              setMessages((currentMessages) => [...currentMessages, responseMessage])
            }}
          />
        )}
        <ChatScrollAnchor trackVisibility={true} />
      </div>
      <div className="fixed inset-x-0 bottom-0 w-full bg-gradient-to-b from-muted/30 from-0% to-muted/30 to-50% duration-300 ease-in-out animate-in dark:from-background/10 dark:from-10% dark:to-background/80 peer-[[data-state=open]]:group-[]:lg:pl-[250px] peer-[[data-state=open]]:group-[]:xl:pl-[300px]">
        <div className="mx-auto sm:max-w-2xl sm:px-4">
          <div className="space-y-4 border-t bg-background px-4 py-2 shadow-lg sm:rounded-t-xl sm:border md:py-4">
            <form
              ref={formRef}
              onSubmit={async (e: any) => {
                e.preventDefault()

                // Blur focus on mobile
                if (window.innerWidth < 600) {
                  e.target['message']?.blur()
                }

                const value = inputValue.trim()
                setInputValue('')
                if (!value) return

                // Add user message UI
                setMessages((currentMessages) => [
                  ...currentMessages,
                  {
                    id: Date.now(),
                    display: <UserMessage>{value}</UserMessage>,
                  },
                ])

                try {
                  // Submit and get response message
                  const responseMessage = await submitUserMessage(value)
                  setMessages((currentMessages) => [...currentMessages, responseMessage])
                } catch (error) {
                  toast({
                    title: 'Something went wrong',
                    description: 'Please try again later',
                    duration: 5000,
                  })
                }
              }}
            >
              <div className="relative flex max-h-60 w-full grow flex-col overflow-hidden bg-background px-8 sm:rounded-md sm:border sm:px-12">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute left-0 top-4 h-8 w-8 rounded-full bg-background p-0 sm:left-4"
                      onClick={(e) => {
                        e.preventDefault()
                        window.location.reload()
                      }}
                    >
                      <IconPlus />
                      <span className="sr-only">New Chat</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Chat</TooltipContent>
                </Tooltip>
                <Textarea
                  ref={inputRef}
                  tabIndex={0}
                  onKeyDown={onKeyDown}
                  placeholder="Send a message."
                  className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus-within:outline-none sm:text-sm"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  name="message"
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
                <div className="absolute right-0 top-4 sm:right-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="submit" size="icon" disabled={inputValue === ''}>
                        <IconArrowElbow />
                        <span className="sr-only">Send message</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Send message</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </form>
            <FooterText className="hidden sm:block" />
          </div>
        </div>
      </div>
    </div>
  )
}
