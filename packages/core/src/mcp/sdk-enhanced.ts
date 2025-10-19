// Enhanced MCP Server SDK with JSON-RPC 2.0 compliance
// Following MCP specification: https://spec.modelcontextprotocol.io/specification/

import {
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPContent,
  InitializeParams,
  InitializeResponse,
  ServerCapabilities,
  ServerInfo,
  ToolsListResponse,
  ResourcesListResponse,
  PromptsListResponse,
  MCPError
} from './types';

export class EnhancedMCPServer {
  private tools = new Map<string, MCPTool>();
  private resources = new Map<string, MCPResource>();
  private prompts = new Map<string, MCPPrompt>();
  private handlers = new Map<string, Function>();

  constructor(private config: { name: string; version: string }) {}

  // Tool registration with JSON Schema validation
  registerTool(name: string, description: string, inputSchema: any, handler: Function): void {
    this.tools.set(name, { name, description, inputSchema });
    this.handlers.set(name, handler);

    // Emit notification for tool list change
    this.emitNotification('tools/list_changed');
  }

  // Resource management
  registerResource(uri: string, name: string, description: string, mimeType: string, handler: Function): void {
    this.resources.set(uri, { uri, name, description, mimeType });
    this.handlers.set(uri, handler);

    // Emit notification for resource list change
    this.emitNotification('resources/list_changed');
  }

  // Prompt templates
  registerPrompt(name: string, description: string, promptArguments?: any, handler?: Function): void {
    this.prompts.set(name, { name, description, arguments: promptArguments });
    if (handler) this.handlers.set(`prompt:${name}`, handler);

    // Emit notification for prompt list change
    this.emitNotification('prompts/list_changed');
  }

  // Protocol methods
  async handleInitialize(params: InitializeParams): Promise<InitializeResponse> {
    // Validate protocol version
    const supportedVersions = ['2024-11-05', '2025-06-18'];
    if (!supportedVersions.includes(params.protocolVersion)) {
      throw this.createError(-32000, `Unsupported protocol version: ${params.protocolVersion}`);
    }

    return {
      protocolVersion: params.protocolVersion,
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: false, listChanged: true },
        prompts: { listChanged: true },
        roots: {},
        sampling: {},
        logging: {}
      },
      serverInfo: { name: this.config.name, version: this.config.version }
    };
  }

  async handleToolsList(): Promise<ToolsListResponse> {
    return { tools: Array.from(this.tools.values()) };
  }

  async handleToolCall(name: string, toolArguments: any): Promise<{ content: MCPContent[] }> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw this.createError(-32601, `Tool not found: ${name}`);
    }

    const handler = this.handlers.get(name);
    if (!handler) {
      throw this.createError(-32601, `Handler not found for tool: ${name}`);
    }

    // Validate input against schema (basic validation)
    if (tool.inputSchema && toolArguments) {
      const validation = this.validateInput(toolArguments, tool.inputSchema);
      if (!validation.valid) {
        throw this.createError(-32602, `Invalid arguments: ${validation.error}`);
      }
    }

    try {
      const result = await handler(toolArguments);

      // Ensure result has proper content format
      if (result && typeof result === 'object' && Array.isArray(result.content)) {
        return result;
      }

      // Convert simple results to MCP content format
      return {
        content: [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      throw this.createError(
        -32603,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async handleResourcesList(): Promise<ResourcesListResponse> {
    return { resources: Array.from(this.resources.values()) };
  }

  async handleResourceRead(uri: string): Promise<{ contents: MCPContent[] }> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw this.createError(-32601, `Resource not found: ${uri}`);
    }

    const handler = this.handlers.get(uri);
    if (!handler) {
      throw this.createError(-32601, `Handler not found for resource: ${uri}`);
    }

    try {
      const content = await handler();

      return {
        contents: [{
          type: 'text',
          text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
          mimeType: resource.mimeType
        }]
      };
    } catch (error) {
      throw this.createError(
        -32603,
        `Resource read failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async handlePromptsList(): Promise<PromptsListResponse> {
    return { prompts: Array.from(this.prompts.values()) };
  }

  async handlePromptGet(name: string, promptArguments?: any): Promise<{ messages: any[] }> {
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw this.createError(-32601, `Prompt not found: ${name}`);
    }

    const handler = this.handlers.get(`prompt:${name}`);
    if (handler) {
      try {
        return await handler(promptArguments);
      } catch (error) {
        throw this.createError(
          -32603,
          `Prompt execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Default prompt implementation
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Execute prompt: ${name}${promptArguments ? ' with arguments: ' + JSON.stringify(promptArguments) : ''}`
        }
      }]
    };
  }

  // Utility methods
  getTools(): string[] {
    return Array.from(this.tools.keys());
  }

  getResources(): string[] {
    return Array.from(this.resources.keys());
  }

  getPrompts(): string[] {
    return Array.from(this.prompts.keys());
  }

  // Input validation
  private validateInput(input: any, schema: any): { valid: boolean; error?: string } {
    // Basic JSON Schema validation
    if (schema.type === 'object' && input && typeof input === 'object') {
      // Check required properties
      if (schema.required && Array.isArray(schema.required)) {
        for (const prop of schema.required) {
          if (!(prop in input)) {
            return { valid: false, error: `Missing required property: ${prop}` };
          }
        }
      }

      // Check property types
      if (schema.properties && typeof schema.properties === 'object') {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in input) {
            const value = input[prop];
            const type = (propSchema as any).type;

            if (type && !this.validateType(value, type)) {
              return { valid: false, error: `Invalid type for property ${prop}: expected ${type}` };
            }
          }
        }
      }
    }

    return { valid: true };
  }

  private validateType(value: any, type: string): boolean {
    switch (type) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      case 'object': return value && typeof value === 'object' && !Array.isArray(value);
      case 'array': return Array.isArray(value);
      default: return true; // Unknown types pass validation
    }
  }

  // Error creation
  private createError(code: number, message: string): MCPError {
    return { code, message };
  }

  // Notification emission (for stdio transport)
  private emitNotification(method: string): void {
    // In a real implementation, this would send a JSON-RPC notification
    // For now, we'll just log it
    console.log(`[MCP] Notification: ${method}`);
  }

  // Method dispatch
  async dispatch(method: string, params: any): Promise<any> {
    switch (method) {
      case 'initialize':
        return await this.handleInitialize(params);
      case 'tools/list':
        return await this.handleToolsList();
      case 'tools/call':
        return await this.handleToolCall(params.name, params.arguments);
      case 'resources/list':
        return await this.handleResourcesList();
      case 'resources/read':
        return await this.handleResourceRead(params.uri);
      case 'prompts/list':
        return await this.handlePromptsList();
      case 'prompts/get':
        return await this.handlePromptGet(params.name, params.arguments);
      default:
        throw this.createError(-32601, `Method not found: ${method}`);
    }
  }
}