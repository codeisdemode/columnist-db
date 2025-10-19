// MCP (Model Context Protocol) Type Definitions
// Following MCP specification: https://spec.modelcontextprotocol.io/specification/

// MCP Configuration
export interface MCPConfig {
  databaseName: string;
  authToken?: string;
  enableMemoryAI?: boolean;
  maxConnections?: number;
  protocolVersion?: string;
}

// MCP Tool Definitions
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Record<string, any>;
}

// Database Adapter Interface
export interface ColumnistDBAdapter {
  getSchema(): Promise<any>;
  query(table: string, options: any): Promise<any>;
  search(table: string, query: string, options: any): Promise<any>;
  insert(table: string, records: any[]): Promise<any>;
  getDB(): any;
  init(): Promise<void>;
}

// Protocol Types - JSON-RPC 2.0 compliant
export interface InitializeParams {
  protocolVersion: string;
  capabilities: {
    tools?: {};
    resources?: { subscribe?: boolean; listChanged?: boolean };
    prompts?: {};
    roots?: {};
    sampling?: {};
    logging?: {};
  };
  clientInfo?: { name: string; version: string };
}

export interface ToolCallParams {
  name: string;
  arguments: Record<string, any>;
}

export interface ResourceReadParams {
  uri: string;
}

export interface PromptGetParams {
  name: string;
  arguments?: Record<string, any>;
}

// Content Types for MCP Responses
export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string; // base64 for images/binary
  mimeType?: string;
  resource?: {
    uri: string;
    mimeType: string;
    text?: string;
  };
}

export interface MCPResponse {
  content: MCPContent[];
  isError?: boolean;
}

// Error Types
export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// JSON-RPC Message Types
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: MCPError;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// Server Capabilities
export interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  roots?: {};
  sampling?: {};
  logging?: {};
}

// Server Info
export interface ServerInfo {
  name: string;
  version: string;
}

// Tool List Response
export interface ToolsListResponse {
  tools: MCPTool[];
}

// Resource List Response
export interface ResourcesListResponse {
  resources: MCPResource[];
}

// Prompt List Response
export interface PromptsListResponse {
  prompts: MCPPrompt[];
}

// Initialize Response
export interface InitializeResponse {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: ServerInfo;
}

// Authentication Types
export interface AuthConfig {
  secret?: string;
  requireAuth: boolean;
}

export interface TokenValidation {
  valid: boolean;
  clientId?: string;
}

// Security Types
export interface QueryValidation {
  valid: boolean;
  error?: string;
}

export interface ConnectionInfo {
  count: number;
  lastAccess: number;
}

// Memory AI Types (for future integration)
export interface MemoryConfig {
  vectorDimensions: number;
  maxMemories: number;
  retentionDays: number;
}

