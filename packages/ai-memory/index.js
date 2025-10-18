#!/usr/bin/env node

/**
 * Columnist-DB AI Memory MCP Server
 *
 * Unified AI memory function for storing and retrieving any content type
 * Supports conversations, documents, web content, notes, research papers, and custom data
 *
 * Note: This server is now unified and includes all memory capabilities.
 * The legacy Research Assistant MCP is deprecated.
 */

import { UnifiedAIMemoryMCPServer } from './unified-server.js';

// Export the unified server as the main implementation
export { UnifiedAIMemoryMCPServer as AIMemoryMCPServer };

// Legacy class for backward compatibility
class AIMemoryMCPServer extends UnifiedAIMemoryMCPServer {
  constructor(config) {
    super(config);
  }

}

// CLI interface
if (require.main === module) {
  const server = new UnifiedAIMemoryMCPServer();

  server.start().catch(error => {
    console.error('Failed to start Unified AI Memory MCP server:', error);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.error('\nShutting down Unified AI Memory MCP server...');
    await server.stop();
    process.exit(0);
  });
}

export { UnifiedAIMemoryMCPServer as AIMemoryMCPServer };