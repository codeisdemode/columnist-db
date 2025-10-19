// Security Manager for MCP
// Implements comprehensive security measures including rate limiting, query validation, and access control

export interface SecurityConfig {
  maxConnectionsPerClient: number;
  maxQueryComplexity: number;
  allowedTables: string[];
  allowedOperations: string[];
  rateLimitWindowMs: number;
  maxRequestsPerWindow: number;
}

export class SecurityManager {
  private connections = new Map<string, number>();
  private requestCounts = new Map<string, { count: number; windowStart: number }>();
  private blockedClients = new Set<string>();

  constructor(private config: SecurityConfig) {
    this.config.maxConnectionsPerClient = this.config.maxConnectionsPerClient || 10;
    this.config.maxQueryComplexity = this.config.maxQueryComplexity || 1000;
    this.config.allowedTables = this.config.allowedTables || [];
    this.config.allowedOperations = this.config.allowedOperations || ['query', 'read'];
    this.config.rateLimitWindowMs = this.config.rateLimitWindowMs || 60000; // 1 minute
    this.config.maxRequestsPerWindow = this.config.maxRequestsPerWindow || 100;
  }

  async validateQuery(query: any): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check for malicious patterns
      if (this.containsMaliciousPatterns(query)) {
        return { valid: false, error: 'Query contains potentially malicious patterns' };
      }

      // Check query complexity
      const complexity = this.calculateQueryComplexity(query);
      if (complexity > this.config.maxQueryComplexity) {
        return { valid: false, error: `Query too complex (${complexity} > ${this.config.maxQueryComplexity})` };
      }

      // Validate query structure
      if (!this.isValidQueryStructure(query)) {
        return { valid: false, error: 'Invalid query structure' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Query validation failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async sanitizeInput(input: any): Promise<any> {
    if (typeof input === 'string') {
      return this.sanitizeString(input);
    }

    if (Array.isArray(input)) {
      return Promise.all(input.map(item => this.sanitizeInput(item)));
    }

    if (input && typeof input === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = await this.sanitizeInput(value);
      }
      return sanitized;
    }

    return input;
  }

  async sanitizeOutput(output: any): Promise<any> {
    // Remove sensitive fields from output
    if (Array.isArray(output)) {
      return output.map(item => this.removeSensitiveFields(item));
    }

    if (output && typeof output === 'object') {
      return this.removeSensitiveFields(output);
    }

    return output;
  }

  async logSecurityEvent(event: string, details: any): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      details,
      severity: this.getEventSeverity(event)
    };

    console.log(`[SECURITY] ${timestamp} - ${event}:`, details);

    // TODO: Implement proper security logging (file, database, etc.)
  }

  isTableAllowed(table: string): boolean {
    // If no allowed tables specified, allow all
    if (this.config.allowedTables.length === 0) return true;

    return this.config.allowedTables.includes(table);
  }

  isOperationAllowed(operation: string): boolean {
    // If no allowed operations specified, allow all
    if (this.config.allowedOperations.length === 0) return true;

    return this.config.allowedOperations.includes(operation);
  }

  checkConnection(clientId: string): boolean {
    // Check if client is blocked
    if (this.blockedClients.has(clientId)) {
      return false;
    }

    const currentConnections = this.connections.get(clientId) || 0;
    if (currentConnections >= this.config.maxConnectionsPerClient) {
      this.logSecurityEvent('connection_limit_exceeded', { clientId, currentConnections });
      return false;
    }

    this.connections.set(clientId, currentConnections + 1);
    return true;
  }

  releaseConnection(clientId: string): void {
    const currentConnections = this.connections.get(clientId) || 0;
    if (currentConnections > 0) {
      this.connections.set(clientId, currentConnections - 1);
    }
  }

  checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const clientData = this.requestCounts.get(clientId);

    if (!clientData) {
      this.requestCounts.set(clientId, { count: 1, windowStart: now });
      return true;
    }

    // Reset window if expired
    if (now - clientData.windowStart > this.config.rateLimitWindowMs) {
      clientData.count = 1;
      clientData.windowStart = now;
      return true;
    }

    // Check rate limit
    if (clientData.count >= this.config.maxRequestsPerWindow) {
      this.logSecurityEvent('rate_limit_exceeded', { clientId, count: clientData.count });
      this.blockedClients.add(clientId);

      // Auto-unblock after window expires
      setTimeout(() => {
        this.blockedClients.delete(clientId);
      }, this.config.rateLimitWindowMs);

      return false;
    }

    clientData.count++;
    return true;
  }

  private containsMaliciousPatterns(query: any): boolean {
    const queryStr = JSON.stringify(query).toLowerCase();

    // Check for common injection patterns
    const maliciousPatterns = [
      /drop\s+table/i,
      /delete\s+from/i,
      /update\s+.*set/i,
      /insert\s+into/i,
      /union\s+select/i,
      /or\s+1=1/i,
      /';/i,
      /\\x/i
    ];

    return maliciousPatterns.some(pattern => pattern.test(queryStr));
  }

  private calculateQueryComplexity(query: any): number {
    let complexity = 0;

    if (typeof query === 'object' && query !== null) {
      // Count fields in where clause
      if (query.where && typeof query.where === 'object') {
        complexity += Object.keys(query.where).length * 10;
      }

      // Count array operations
      if (query.$in && Array.isArray(query.$in)) {
        complexity += query.$in.length * 5;
      }

      // Count nested objects
      const countNested = (obj: any): number => {
        let count = 0;
        for (const value of Object.values(obj)) {
          if (typeof value === 'object' && value !== null) {
            count += 1 + countNested(value);
          }
        }
        return count;
      };

      complexity += countNested(query) * 2;
    }

    return complexity;
  }

  private isValidQueryStructure(query: any): boolean {
    if (typeof query !== 'object' || query === null) {
      return false;
    }

    // Check for valid query operators
    const validOperators = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$and', '$or'];

    const checkOperators = (obj: any): boolean => {
      for (const key in obj) {
        if (key.startsWith('$') && !validOperators.includes(key)) {
          return false;
        }
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (!checkOperators(obj[key])) {
            return false;
          }
        }
      }
      return true;
    };

    return checkOperators(query);
  }

  private sanitizeString(str: string): string {
    // Remove potentially dangerous characters
    return str
      .replace(/[<>\"\']/g, '')
      .replace(/\\/g, '\\\\')
      .trim();
  }

  private removeSensitiveFields(obj: any): any {
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    const result = { ...obj };

    for (const field of sensitiveFields) {
      if (result[field] !== undefined) {
        delete result[field];
      }
    }

    return result;
  }

  private getEventSeverity(event: string): string {
    const criticalEvents = ['rate_limit_exceeded', 'connection_limit_exceeded'];
    const warningEvents = ['query_validation_failed'];

    if (criticalEvents.includes(event)) return 'CRITICAL';
    if (warningEvents.includes(event)) return 'WARNING';
    return 'INFO';
  }

  // Cleanup expired rate limit data
  cleanupExpiredData(): void {
    const now = Date.now();
    for (const [clientId, data] of this.requestCounts.entries()) {
      if (now - data.windowStart > this.config.rateLimitWindowMs * 2) {
        this.requestCounts.delete(clientId);
      }
    }
  }

  // Get security statistics
  getStats(): any {
    return {
      activeConnections: Array.from(this.connections.entries()).reduce((sum, [, count]) => sum + count, 0),
      uniqueClients: this.connections.size,
      blockedClients: this.blockedClients.size,
      rateLimitWindows: this.requestCounts.size
    };
  }
}