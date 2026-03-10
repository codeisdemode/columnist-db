import { useCallback, useEffect, useRef, useState } from 'react'
import type { ColumnistDB } from 'columnist-db-core'
import { getBrowserMemoryDb } from '../lib/createBrowserMemoryClient'

export interface MemoryDocument {
  id: string
  content: string
  summary: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  sources?: string[]
}

interface AskOptions {
  enableLLM?: boolean
}

async function callOpenAI(apiKey: string, question: string, context: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a memory assistant. Use the provided local memory context to answer the user. If the context is insufficient, say that clearly and then answer as helpfully as you can.'
        },
        {
          role: 'user',
          content: `Question:\n${question}\n\nLocal memory context:\n${context}`
        }
      ],
      temperature: 0.4,
      max_tokens: 700
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    const message =
      typeof errorData?.error?.message === 'string'
        ? errorData.error.message
        : 'OpenAI request failed'
    throw new Error(message)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? 'No response returned by OpenAI.'
}

export function useBrowserMemoryAssistant() {
  const [db, setDb] = useState<ColumnistDB | null>(null)
  const [documents, setDocuments] = useState<MemoryDocument[]>([])
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const apiKeyRef = useRef<string>('')

  useEffect(() => {
    ;(async () => {
      try {
        const instance = await getBrowserMemoryDb()
        setDb(instance)
        const existing = await instance.getAll('memories', 250)
        setDocuments(
          (existing as Array<Partial<MemoryDocument> & { id: string | number }>).map(item => ({
            id: String(item.id),
            content: item.content ?? '',
            summary: item.summary ?? '',
            tags: item.tags ?? [],
            createdAt: item.createdAt ?? new Date(),
            updatedAt: item.updatedAt ?? new Date()
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize Columnist')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  const addDocument = useCallback(
    async (content: string, tags: string[] = []) => {
      if (!db) throw new Error('Database not ready')
      const summary = content.slice(0, 280)
      const now = new Date()
      const inserted = await db.insert(
        {
          id: crypto.randomUUID(),
          content,
          summary,
          tags,
          createdAt: now,
          updatedAt: now
        },
        'memories'
      )
      const doc: MemoryDocument = {
        id: String(inserted.id),
        content,
        summary,
        tags,
        createdAt: now,
        updatedAt: now
      }
      setDocuments(prev => [...prev, doc])
      return doc
    },
    [db]
  )

  const searchMemories = useCallback(
    async (query: string) => {
      if (!db) throw new Error('Database not ready')
      const results = await db.search(query, { table: 'memories', limit: 5 })
      return results as MemoryDocument[]
    },
    [db]
  )

  const askAssistant = useCallback(
    async (question: string, options: AskOptions = {}) => {
      const timestamp = new Date()
      const userMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: question,
        timestamp
      }
      setMessages(prev => [...prev, userMessage])

      const matches = await searchMemories(question)
      const sources = matches.map(match => `${match.summary}...`)

      let response =
        matches.length > 0
          ? `Using ${matches.length} local memories:\n\n${matches
              .slice(0, 3)
              .map((match, index) => `[${index + 1}] ${match.summary}`)
              .join('\n')}`
          : "I didn't find anything locally. Add more notes!"

      if (options.enableLLM && apiKeyRef.current) {
        const context =
          matches.length > 0
            ? matches
                .slice(0, 5)
                .map((match, index) => `[${index + 1}] ${match.content}`)
                .join('\n\n')
            : 'No relevant local memories were found.'

        try {
          response = await callOpenAI(apiKeyRef.current, question, context)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown OpenAI error'
          response += `\n\nOpenAI fallback failed: ${message}`
        }
      }

      const assistantMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        sources
      }

      setMessages(prev => [...prev, assistantMessage])
      return assistantMessage
    },
    [searchMemories]
  )

  const configureApiKey = useCallback((key: string) => {
    apiKeyRef.current = key
  }, [])

  return {
    isLoading,
    error,
    documents,
    messages,
    addDocument,
    searchMemories,
    askAssistant,
    configureApiKey
  }
}
