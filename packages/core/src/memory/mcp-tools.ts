// MCP Tools for Memory AI Operations

import { MCPServer } from '../mcp/sdk-minimal';
import { ColumnistDB } from '../columnist';
import { MemoryManager } from './manager';
import { MemoryQueryOptions, MemoryContext } from './types';

/**
 * MCP Tools for memory operations
 */
export class MemoryMCPTools {
  private memoryManager: MemoryManager;
  private mcpServer: MCPServer;

  constructor(db: ColumnistDB, mcpServer: MCPServer) {
    this.memoryManager = new MemoryManager(db);
    this.mcpServer = mcpServer;
    this.registerTools();
  }

  /**
   * Register all memory-related MCP tools
   */
  private registerTools(): void {
    // Store memory tool
    this.mcpServer.tool(
      'store_memory',
      {
        content: { type: 'string', description: 'The memory content to store' },
        category: { type: 'string', description: 'Optional category for the memory', optional: true },
        metadata: { type: 'object', description: 'Optional metadata object', optional: true }
      },
      async ({ content, category, metadata }: any) => {
        try {
          const memoryId = await this.memoryManager.storeMemory(content, category, metadata);
          return {
            content: [{
              type: 'text',
              text: `Memory stored successfully with ID: ${memoryId}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Failed to store memory: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    // Retrieve memories tool
    this.mcpServer.tool(
      'retrieve_memories',
      {
        query: { type: 'string', description: 'Search query or topic', optional: true },
        limit: { type: 'number', description: 'Maximum number of memories to retrieve', optional: true, default: 5 },
        minImportance: { type: 'number', description: 'Minimum importance score (0-1)', optional: true, default: 0.3 },
        category: { type: 'string', description: 'Filter by category', optional: true },
        timeRange: { 
          type: 'object', 
          description: 'Time range filter {start: Date, end: Date}', 
          optional: true 
        }
      },
      async ({ query, limit, minImportance, category, timeRange }: any) => {
        try {
          const options: MemoryQueryOptions = {
            limit,
            minImportance,
            category,
            semanticSearch: query,
            includeRelated: true
          };

          if (timeRange && typeof timeRange === 'object') {
            const { start, end } = timeRange as any;
            if (start && end) {
              options.timeRange = [new Date(start), new Date(end)];
            }
          }

          const results = await this.memoryManager.retrieveMemories(options);
          
          if (results.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'No memories found matching your criteria.'
              }]
            };
          }

          const memoryTexts = results.map((result, index) => 
            `\n--- Memory ${index + 1} ---\n` +
            `Content: ${result.memory.content}\n` +
            `Importance: ${result.memory.importance.toFixed(2)}\n` +
            `Created: ${result.memory.timestamp.toLocaleString()}\n` +
            `Access Count: ${result.memory.accessCount}\n` +
            `Relevance: ${result.relevance.toFixed(2)}\n` +
            `Explanation: ${result.explanation}` +
            (result.memory.category ? `\nCategory: ${result.memory.category}` : '') +
            (result.memory._related ? `\nRelated Memories: ${result.memory._related.length} found` : '')
          );

          return {
            content: [{
              type: 'text',
              text: `Found ${results.length} memories:\n${memoryTexts.join('\n\n')}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Failed to retrieve memories: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    // Contextual memory search tool
    this.mcpServer.tool(
      'contextual_memory_search',
      {
        currentTopic: { type: 'string', description: 'Current conversation topic' },
        userPreferences: { type: 'object', description: 'User preferences context', optional: true },
        timeContext: { 
          type: 'object', 
          description: 'Temporal context {timeOfDay: string, dayOfWeek: string}', 
          optional: true 
        }
      },
      async ({ currentTopic, userPreferences, timeContext }: any) => {
        try {
          // Build context-aware query
          const context: MemoryContext = {
            currentTopic,
            recentMemories: [],
            userPreferences: userPreferences as Record<string, unknown>,
            temporalContext: {
              timeOfDay: timeContext?.timeOfDay || new Date().toLocaleTimeString(),
              dayOfWeek: timeContext?.dayOfWeek || new Date().toLocaleDateString('en', { weekday: 'long' }),
              season: this.getCurrentSeason()
            }
          };

          // Get recent memories for context
          const recent = await this.memoryManager.retrieveMemories({
            limit: 5,
            sortBy: 'recency'
          });

          context.recentMemories = recent.map(r => r.memory);

          // Search with context
          const results = await this.memoryManager.retrieveContextualMemories(context, {
            limit: 3,
            includeRelated: true
          });

          const resultTexts = results.map((result, index) => 
            `\n--- Contextual Memory ${index + 1} ---\n` +
            `Content: ${result.memory.content}\n` +
            `Contextual Relevance: ${result.relevance.toFixed(2)}\n` +
            `Explanation: ${result.explanation}`
          );

          return {
            content: [{
              type: 'text',
              text: `Contextual memory search for "${currentTopic}":\n` +
                    `Found ${results.length} relevant memories:\n${resultTexts.join('\n\n')}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Failed to perform contextual search: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    // Memory consolidation tool
    this.mcpServer.tool(
      'consolidate_memories',
      {},
      async () => {
        try {
          const result = await this.memoryManager.consolidateMemoriesWithMetadata();
          
          return {
            content: [{
              type: 'text',
              text: `Memory consolidation completed:\n` +
                    `- Retained: ${result.retained} memories\n` +
                    `- Compressed: ${result.compressed} memories\n` +
                    `- Discarded: ${result.discarded} memories\n` +
                    `- Space saved: ${result.spaceSaved} memories\n` +
                    `- Quality improvement: ${result.improvementRatio.toFixed(2)}x\n` +
                    `Total memories after consolidation: ${result.retained + result.compressed}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Failed to consolidate memories: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    // Get memory statistics tool
    this.mcpServer.tool(
      'get_memory_stats',
      {},
      async () => {
        try {
          const stats = await this.memoryManager.getStats();
          
          const distributionText = Object.entries(stats.memoryDistribution)
            .map(([range, count]) => `  ${range}: ${count} memories`)
            .join('\n');

          return {
            content: [{
              type: 'text',
              text: `Memory Statistics:\n` +
                    `Total memories: ${stats.total}\n` +
                    `Average importance: ${stats.averageImportance.toFixed(3)}\n` +
                    `Most recent: ${stats.mostRecent ? stats.mostRecent.toLocaleString() : 'None'}\n` +
                    `Importance distribution:\n${distributionText}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Failed to get memory statistics: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
  }

  /**
   * Get current season based on date
   */
  private getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  /**
   * Initialize memory system
   */
  async initialize(): Promise<void> {
    await this.memoryManager.initialize();
  }

  /**
   * Get the memory manager instance
   */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }
}