'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatDB, type ChatMessage } from '@/hooks/useChatDB';
import { MCPIntegration } from '@/components/MCPIntegration';

export default function ChatWithLLM() {
  const {
    isLoading,
    error,
    addDocument,
    searchDocuments,
    sendMessage,
    messages,
    setMessages,
    documents,
    clearChat,
    clearDocuments
  } = useChatDB();

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'documents' | 'settings' | 'mcp'>('chat');
  const [useLLM, setUseLLM] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-3.5-turbo');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleMcpToolCall = async (toolName: string, args: Record<string, unknown>) => {
    switch (toolName) {
      case 'search_papers':
        return searchDocuments(typeof args.query === 'string' ? args.query : 'vector search');
      case 'add_research_paper': {
        const title = typeof args.title === 'string' ? args.title : 'Untitled paper';
        const authors = typeof args.authors === 'string' ? args.authors : 'Unknown author';
        const abstract =
          typeof args.abstract === 'string' ? args.abstract : 'No abstract provided.';
        const publicationDate =
          typeof args.publication_date === 'string'
            ? args.publication_date
            : new Date().toISOString().slice(0, 10);
        const tags = typeof args.tags === 'string' ? args.tags : 'research';
        const content = [
          `Title: ${title}`,
          `Authors: ${authors}`,
          `Publication Date: ${publicationDate}`,
          `Tags: ${tags}`,
          '',
          abstract
        ].join('\n');

        const insertedId = await addDocument(content, {
          filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'paper'}.txt`,
          type: 'mcp-import',
          uploadedAt: new Date().toISOString()
        });

        return { insertedId, title, tags };
      }
      case 'get_research_summary':
        return {
          documents: documents.length,
          messages: messages.length,
          llmEnabled: useLLM && Boolean(apiKey),
          model: useLLM && apiKey ? model : null
        };
      case 'find_related_papers':
        return searchDocuments(typeof args.topic === 'string' ? args.topic : 'offline vector search');
      default:
        throw new Error(`Unsupported tool: ${toolName}`);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load API key from localStorage
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai-api-key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('openai-api-key', key);
  };

  const callLLM = async (query: string, context: string) => {
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: `You are a helpful AI assistant with access to a knowledge base. Use the following context from the knowledge base to answer the user's question accurately and helpfully. If the context doesn't contain relevant information, say so and provide a general helpful response.

Context from knowledge base:
${context}

Please provide a clear, helpful response based on the available information.`
          },
          {
            role: 'user',
            content: query
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to call OpenAI API');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      if (useLLM && apiKey) {
        // Enhanced LLM flow
        const userMessage: ChatMessage = {
          role: 'user',
          content: inputMessage,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);

        // Search for relevant documents
        const searchResults = await searchDocuments(inputMessage);

        let response = "I don't have enough information to answer that question.";
        let sources: Array<{ content: string; similarity: number }> = [];

        if (searchResults.length > 0) {
          sources = searchResults;
          const context = searchResults.map((result, index) =>
            `[Source ${index + 1}] ${result.content}`
          ).join('\n\n');

          try {
            response = await callLLM(inputMessage, context);
          } catch (llmError) {
            console.error('LLM call failed:', llmError);
            const errorMessage = llmError instanceof Error ? llmError.message : 'Unknown error';
            response = `LLM Error: ${errorMessage}. Falling back to basic response.\n\nBased on my knowledge base: ${searchResults[0].content.substring(0, 200)}...`;
          }
        } else {
          if (useLLM) {
            try {
              response = await callLLM(inputMessage, 'No relevant context found in the knowledge base.');
            } catch {
              response = "I couldn't find any relevant information in my knowledge base and the LLM service is unavailable. Try uploading some documents first!";
            }
          } else {
            response = "I couldn't find any relevant information in my knowledge base. Try uploading some documents first!";
          }
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: response,
          timestamp: new Date(),
          sources
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Original basic flow
        await sendMessage(inputMessage);
      }

      setInputMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      await addDocument(text, {
        filename: file.name,
        type: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to upload file:', err);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const addSampleDocuments = async () => {
    const sampleDocs = [
      {
        content: `Columnist-DB is a high-performance vector database designed for AI applications. It features advanced HNSW indexing for fast semantic search and supports real-time vector operations in the browser. The database uses sophisticated memory management and caching strategies to ensure optimal performance even with large datasets.`,
        metadata: { filename: 'columnist-db-overview.txt', type: 'documentation' }
      },
      {
        content: `Vector embeddings are numerical representations of text, images, or other data that capture semantic meaning. Columnist-DB can store and search through millions of vectors using cosine similarity and other distance metrics. The system automatically selects the optimal indexing strategy based on dataset size and query patterns.`,
        metadata: { filename: 'vector-embeddings.txt', type: 'technical' }
      },
      {
        content: `RAG (Retrieval-Augmented Generation) combines vector search with language models to provide accurate, context-aware responses. Columnist-DB enables RAG applications by storing document chunks as vectors and retrieving the most relevant information for any given query. This demo showcases how RAG can power intelligent chat applications.`,
        metadata: { filename: 'rag-explanation.txt', type: 'tutorial' }
      }
    ];

    for (const doc of sampleDocs) {
      await addDocument(doc.content, doc.metadata);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing AI Chat Database...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center">
        <div className="text-center text-red-600">
          <h2 className="text-xl font-semibold">Database Error</h2>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Chat with LLM + Knowledge Base</h1>
              <p className="text-gray-600">Powered by Columnist-DB Vector Search & OpenAI</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                {documents.length} documents • {messages.length} messages
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Knowledge Base</h3>

              <div className="space-y-3">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeTab === 'chat'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  💬 Chat
                </button>

                <button
                  onClick={() => setActiveTab('documents')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeTab === 'documents'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  📚 Documents ({documents.length})
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeTab === 'settings'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  ⚙️ Settings
                </button>

                <button
                  onClick={() => setActiveTab('mcp')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeTab === 'mcp'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  🔧 MCP Server
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Quick Actions</h4>

                <div className="space-y-2">
                  <label className="block">
                    <input
                      type="file"
                      accept=".txt,.md,.pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <span className="block w-full text-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer transition-colors">
                      📄 Upload Document
                    </span>
                  </label>

                  <button
                    onClick={addSampleDocuments}
                    className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    🧪 Add Sample Docs
                  </button>

                  <button
                    onClick={clearChat}
                    className="w-full px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    🗑️ Clear Chat
                  </button>

                  <button
                    onClick={clearDocuments}
                    className="w-full px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    🗑️ Clear Docs
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeTab === 'chat' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-[600px] flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                      <div className="text-6xl mb-4">🤖</div>
                      <h3 className="text-lg font-semibold mb-2">Welcome to Enhanced AI Chat!</h3>
                      <p>Start a conversation or upload documents to build your knowledge base.</p>
                      <div className="mt-4 text-sm text-purple-600">
                        {useLLM ? (
                          apiKey ? (
                            '✅ LLM Integration Active'
                          ) : (
                            '⚠️ Configure OpenAI API key in Settings'
                          )
                        ) : (
                          '⚡ Basic Mode (Fast Vector Search Only)'
                        )}
                      </div>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            message.role === 'user'
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{message.content}</div>
                          {message.sources && message.sources.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200/50">
                              <p className="text-xs opacity-75 mb-1">Sources:</p>
                              {message.sources.map((source, idx) => (
                                <div key={idx} className="text-xs opacity-75">
                                  • {source.content.substring(0, 100)}...
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="border-t border-gray-200 p-4">
                  <div className="flex gap-3">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask a question about your documents..."
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                      rows={2}
                      disabled={isSending}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isSending}
                      className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSending ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        'Send'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Knowledge Base Documents</h2>
                  <span className="text-sm text-gray-500">{documents.length} documents</span>
                </div>

                {documents.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    <div className="text-6xl mb-4">📚</div>
                    <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
                    <p>Upload documents or add sample data to build your knowledge base.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {documents.map((doc, index) => (
                      <div key={index} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">
                              {doc.metadata?.filename || `Document ${index + 1}`}
                            </h4>
                            <p className="text-gray-600 text-sm mt-1">
                              {doc.content.substring(0, 200)}...
                            </p>
                            <div className="flex gap-2 mt-2">
                              {doc.metadata?.type && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                                  {doc.metadata.type}
                                </span>
                              )}
                              {doc.metadata?.uploadedAt && (
                                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                  {new Date(doc.metadata.uploadedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Settings</h2>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">LLM Integration</h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="use-llm"
                          checked={useLLM}
                          onChange={(e) => setUseLLM(e.target.checked)}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <label htmlFor="use-llm" className="text-gray-700">
                          Enable OpenAI LLM Integration
                        </label>
                      </div>

                      {useLLM && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              OpenAI API Key
                            </label>
                            <input
                              type="password"
                              value={apiKey}
                              onChange={(e) => saveApiKey(e.target.value)}
                              placeholder="sk-..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Your API key is stored locally in your browser
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Model
                            </label>
                            <select
                              value={model}
                              onChange={(e) => setModel(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                              <option value="gpt-4">GPT-4</option>
                              <option value="gpt-4-turbo">GPT-4 Turbo</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">Database Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-gray-600">Documents</div>
                        <div className="font-semibold">{documents.length}</div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-gray-600">Messages</div>
                        <div className="font-semibold">{messages.length}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">About This Demo</h3>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-purple-800 text-sm">
                        This enhanced demo showcases Columnist-DB&apos;s vector search capabilities combined with OpenAI LLM integration.
                        The system uses HNSW indexing for fast semantic search and can optionally use LLMs to generate intelligent
                        responses based on retrieved context.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'mcp' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">MCP Server Integration</h2>
                <MCPIntegration onToolCall={handleMcpToolCall} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
