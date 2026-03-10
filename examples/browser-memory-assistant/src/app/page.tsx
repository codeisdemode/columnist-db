'use client'

import { useState } from 'react'
import { useBrowserMemoryAssistant } from '../hooks/useBrowserMemoryAssistant'

export default function BrowserMemoryAssistantPage() {
  const { isLoading, error, documents, messages, addDocument, askAssistant, configureApiKey } =
    useBrowserMemoryAssistant()
  const [input, setInput] = useState('')
  const [fileText, setFileText] = useState('')
  const [apiKey, setApiKey] = useState('')

  if (isLoading) {
    return <p className="p-8 text-lg">Initializing Columnist…</p>
  }

  if (error) {
    return (
      <div className="p-8 text-red-600">
        <p>Failed to boot demo:</p>
        <pre className="mt-2 text-sm">{error}</pre>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold">Browser Memory Assistant</h1>
          <p className="text-gray-600">Local-first RAG built on Columnist-DB</p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Ask a question</h2>
            <textarea
              className="mt-3 w-full rounded border border-gray-200 p-3"
              rows={4}
              placeholder="How does sync work offline?"
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <button
              className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
              onClick={() => {
                if (!input.trim()) return
                void askAssistant(input, { enableLLM: Boolean(apiKey) })
                setInput('')
              }}
            >
              Run Hybrid Search
            </button>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Add a document</h2>
            <textarea
              className="mt-3 w-full rounded border border-gray-200 p-3"
              rows={4}
              placeholder="Paste meeting notes or docs here"
              value={fileText}
              onChange={e => setFileText(e.target.value)}
            />
            <button
              className="mt-3 w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white"
              onClick={() => {
                if (!fileText.trim()) return
                void addDocument(fileText)
                setFileText('')
              }}
            >
              Save Memory
            </button>

            <div className="mt-6 space-y-2">
              <label className="text-sm font-medium text-gray-700">OpenAI API Key (optional)</label>
              <input
                type="password"
                className="w-full rounded border border-gray-200 p-2"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
              <button
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                onClick={() => configureApiKey(apiKey)}
              >
                Save Key
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Conversation</h2>
            <div className="mt-3 space-y-4">
              {messages.map(message => (
                <article key={message.id} className="rounded border border-gray-100 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{message.role}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  {message.sources && message.sources.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-500">
                      {message.sources.map((source, idx) => (
                        <li key={idx}>{source}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
              {messages.length === 0 && <p className="text-sm text-gray-500">No messages yet.</p>}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Memories ({documents.length})</h2>
            <div className="mt-3 space-y-3">
              {documents.map(doc => (
                <article key={doc.id} className="rounded border border-gray-100 p-3 text-sm">
                  <p className="font-medium text-gray-800">{doc.summary}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Saved {doc.createdAt.toLocaleDateString()} • {doc.tags.join(', ') || 'untagged'}
                  </p>
                </article>
              ))}
              {documents.length === 0 && <p className="text-sm text-gray-500">No memories stored yet.</p>}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

