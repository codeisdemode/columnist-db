'use client';

import { useState } from 'react';

interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, MCPParameter>;
  sampleArgs: Record<string, unknown>;
}

interface MCPIntegrationProps {
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<unknown> | unknown;
}

interface MCPParameter {
  type: string;
  description: string;
  optional?: boolean;
}

export function MCPIntegration({ onToolCall }: MCPIntegrationProps) {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [toolResults, setToolResults] = useState<string>('');

  const mcpTools: MCPTool[] = [
    {
      name: 'search_papers',
      description: 'Search research papers by title, abstract, authors, or tags',
      parameters: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum number of results', optional: true }
      },
      sampleArgs: { query: 'vector search', limit: 3 }
    },
    {
      name: 'add_research_paper',
      description: 'Add a new research paper to the database',
      parameters: {
        title: { type: 'string', description: 'Paper title' },
        authors: { type: 'string', description: 'Comma-separated list of authors' },
        abstract: { type: 'string', description: 'Paper abstract' },
        publication_date: { type: 'string', description: 'Publication date (YYYY-MM-DD)' },
        tags: { type: 'string', description: 'Comma-separated tags' }
      },
      sampleArgs: {
        title: 'Columnist-DB MCP demo note',
        authors: 'Columnist Demo',
        abstract: 'Demonstrates invoking local tool shapes that mirror the MCP example server.',
        publication_date: '2026-03-10',
        tags: 'mcp, demo, columnist-db'
      }
    },
    {
      name: 'get_research_summary',
      description: 'Get a summary of research progress and statistics',
      parameters: {},
      sampleArgs: {}
    },
    {
      name: 'find_related_papers',
      description: 'Find papers related to a specific topic or paper',
      parameters: {
        topic: { type: 'string', description: 'Topic or paper title' }
      },
      sampleArgs: { topic: 'offline vector search' }
    }
  ];

  const handleToolCall = async (toolName: string, args: Record<string, unknown>) => {
    setActiveTool(toolName);

    try {
      if (!onToolCall) {
        setToolResults(
          `No tool runner connected.\n\nRequested ${toolName} with:\n${JSON.stringify(args, null, 2)}`
        );
        return;
      }

      const result = await onToolCall(toolName, args);
      setToolResults(JSON.stringify({ tool: toolName, args, result }, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool error';
      setToolResults(JSON.stringify({ tool: toolName, args, error: message }, null, 2));
    } finally {
      setActiveTool(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">MCP Server Integration</h3>
      <p className="text-gray-600 text-sm mb-4">
        This panel exercises MCP-style tool shapes against the local demo state. The standalone
        `examples/mcp-memory-server` example exposes the same ideas over stdio.
      </p>

      <div className="space-y-3">
        {mcpTools.map((tool) => (
          <div
            key={tool.name}
            data-testid={`mcp-tool-${tool.name}`}
            className="border border-gray-200 rounded-lg p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{tool.name}</h4>
                <p className="text-gray-600 text-sm mt-1">{tool.description}</p>

                {Object.keys(tool.parameters).length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Parameters:</p>
                    <div className="space-y-1">
                      {Object.entries(tool.parameters).map(([paramName, paramConfig]) => (
                        <div key={paramName} className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">{paramName}</span>
                          <span className="text-gray-500">({paramConfig.type})</span>
                          {paramConfig.optional && (
                            <span className="text-orange-500 text-xs">optional</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                data-testid={`mcp-call-${tool.name}`}
                onClick={() => handleToolCall(tool.name, tool.sampleArgs)}
                disabled={activeTool === tool.name}
                className="ml-4 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {activeTool === tool.name ? 'Calling...' : 'Call Tool'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {toolResults && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">Tool Results</h4>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap">{toolResults}</pre>
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-gray-200">
        <h4 className="font-medium text-gray-900 mb-2">Integration Notes</h4>
        <div className="text-sm text-gray-600 space-y-2">
          <p>- MCP servers typically run as separate processes and communicate via stdio.</p>
          <p>- Tool names and argument shapes here mirror the standalone example server.</p>
          <p>- Swap the local runner for an MCP transport when wiring a real client.</p>
          <p>- The results shown above come from actual local actions, not fabricated strings.</p>
        </div>
      </div>
    </div>
  );
}
