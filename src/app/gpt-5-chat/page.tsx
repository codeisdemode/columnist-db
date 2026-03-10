'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatDB, type ChatMessage } from '@/hooks/useChatDB';

export default function GPT5Chat() {
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
  const [activeTab, setActiveTab] = useState<'chat' | 'documents' | 'settings'>('chat');
  const [apiKey, setApiKey] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [model, setModel] = useState('gpt-5-mini');
  const [reasoningEffort, setReasoningEffort] = useState<'minimal' | 'low' | 'medium' | 'high'>('low');
  const [verbosity, setVerbosity] = useState<'low' | 'medium' | 'high'>('medium');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      setTempApiKey(savedApiKey);
    }
  }, []);

  const saveApiKey = () => {
    if (tempApiKey.trim()) {
      setApiKey(tempApiKey);
      localStorage.setItem('openai-api-key', tempApiKey);
    }
  };

  const callGPT5 = async (query: string, context: string) => {
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
        max_completion_tokens: 4000,
        temperature: 0.7,
        reasoning_effort: reasoningEffort,
        verbosity: verbosity
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to call GPT-5 API');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      if (apiKey) {
        // GPT-5 enhanced flow
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
            response = await callGPT5(inputMessage, context);
          } catch (llmError) {
            console.error('GPT-5 call failed:', llmError);
            const errorMessage = llmError instanceof Error ? llmError.message : 'Unknown error';
            response = `GPT-5 Error: ${errorMessage}. Falling back to basic response.\n\nBased on my knowledge base: ${searchResults[0].content.substring(0, 200)}...`;
          }
        } else {
          try {
            response = await callGPT5(inputMessage, 'No relevant context found in the knowledge base.');
          } catch {
            response = "I couldn't find any relevant information in my knowledge base and the GPT-5 service is unavailable. Try uploading some documents first!";
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
        content: `GPT-5 represents the next generation of large language models with enhanced reasoning capabilities, larger context windows, and improved tool integration. The model supports various reasoning effort levels and verbosity controls, making it suitable for both simple queries and complex analytical tasks.`,
        metadata: { filename: 'gpt-5-overview.txt', type: 'technical' }
      }
    ];

    for (const doc of sampleDocs) {
      await addDocument(doc.content, doc.metadata);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing AI Chat Database...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <h2 className="text-xl font-semibold">Database Error</h2>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Columnist-DB + GPT-5</h1>
              <p className="text-gray-600">Advanced AI Chat with Knowledge Base Integration</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                {documents.length} documents • {messages.length} messages
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  💬 Chat
                </button>

                <button
                  onClick={() => setActiveTab('documents')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeTab === 'documents'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  📚 Documents ({documents.length})
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    activeTab === 'settings'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  ⚙️ Settings
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
                    <span className="block w-full text-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                      📄 Upload Document
                    </span>
                  </label>

                  <button
                    onClick={addSampleDocuments}
                    className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
                      <h3 className="text-lg font-semibold mb-2">Welcome to GPT-5 Enhanced Chat!</h3>
                      <p>Start a conversation or upload documents to build your knowledge base.</p>
                      <div className="mt-4 text-sm text-blue-600">
                        {apiKey ? (
                          '✅ GPT-5 Integration Active'
                        ) : (
                          '⚠️ Enter your API key below to enable GPT-5'
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
                              ? 'bg-blue-600 text-white'
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

                {/* API Key Settings */}
                {!apiKey && (
                  <div className="border-t border-gray-200 p-4 bg-yellow-50">
                    <div className="mb-3">
                      <h4 className="font-medium text-yellow-800 mb-2">Configure OpenAI API Key</h4>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={tempApiKey}
                          onChange={(e) => setTempApiKey(e.target.value)}
                          placeholder="sk-..."
                          className="flex-1 px-3 py-2 border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        />
                        <button
                          onClick={saveApiKey}
                          disabled={!tempApiKey.trim()}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Save
                        </button>
                      </div>
                      <p className="text-xs text-yellow-700 mt-1">
                        Enter your OpenAI API key to enable GPT-5 integration
                      </p>
                    </div>
                  </div>
                )}

                {/* Input */}
                <div className="border-t border-gray-200 p-4">
                  <div className="flex gap-3">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask a question about your documents..."
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={2}
                      disabled={isSending}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isSending}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
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
                    <h3 className="font-medium text-gray-900 mb-3">GPT-5 Configuration</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          OpenAI API Key
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={tempApiKey}
                            onChange={(e) => setTempApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={saveApiKey}
                            disabled={!tempApiKey.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Save
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {apiKey ? '✅ API key saved' : 'Enter your API key and click Save'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          GPT-5 Model
                        </label>
                        <select
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="gpt-5-nano">GPT-5 Nano (Cost Efficient)</option>
                          <option value="gpt-5-mini">GPT-5 Mini (Balanced)</option>
                          <option value="gpt-5">GPT-5 (Full Reasoning)</option>
                          <option value="gpt-5-chat-latest">GPT-5 Chat (Conversational)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Reasoning Effort
                        </label>
                        <select
                          value={reasoningEffort}
                          onChange={(e) => setReasoningEffort(e.target.value as 'minimal' | 'low' | 'medium' | 'high')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="minimal">Minimal (Fastest)</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High (Deep Reasoning)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Response Verbosity
                        </label>
                        <select
                          value={verbosity}
                          onChange={(e) => setVerbosity(e.target.value as 'low' | 'medium' | 'high')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="low">Low (Concise)</option>
                          <option value="medium">Medium</option>
                          <option value="high">High (Detailed)</option>
                        </select>
                      </div>
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
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-blue-800 text-sm">
                        This demo showcases Columnist-DB&apos;s vector search capabilities combined with GPT-5 integration.
                        The system uses HNSW indexing for fast semantic search and leverages GPT-5&apos;s advanced reasoning
                        capabilities to generate intelligent responses based on retrieved context.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
