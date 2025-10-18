// Minimal MCP SDK types and classes for internal use
// This replaces the external @modelcontextprotocol/sdk dependency

export interface MCPToolParam {
  type: string;
  description: string;
  optional?: boolean;
  default?: any;
}

export interface MCPToolHandler {
  (params: any): Promise<any>;
}

export interface MCPResourceHandler {
  (): Promise<string>;
}

export class MCPServer {
  private tools: Map<string, { params: Record<string, MCPToolParam>; handler: MCPToolHandler }> = new Map();
  private resources: Map<string, { name: string; description: string; mimeType: string; handler: MCPResourceHandler }> = new Map();
  
  constructor(private config: { name: string; version: string }) {}

  tool(
    name: string,
    params: Record<string, MCPToolParam>,
    handler: MCPToolHandler
  ): void {
    this.tools.set(name, { params, handler });
  }

  resource(
    uri: string,
    name: string,
    description: string,
    mimeType: string,
    handler: MCPResourceHandler
  ): void {
    this.resources.set(uri, { name, description, mimeType, handler });
  }

  async start(): Promise<void> {
    console.log(`MCP Server "${this.config.name}" v${this.config.version} started`);
    console.log(`Registered ${this.tools.size} tools and ${this.resources.size} resources`);
  }

  async stop(): Promise<void> {
    console.log(`MCP Server "${this.config.name}" stopped`);
  }

  // Simulate tool execution for testing
  async callTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.handler(params);
  }

  // Simulate resource access for testing
  async getResource(uri: string): Promise<string> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }
    return await resource.handler();
  }

  // Get available tools and resources
  getTools(): string[] {
    return Array.from(this.tools.keys());
  }

  getResources(): string[] {
    return Array.from(this.resources.keys());
  }
}