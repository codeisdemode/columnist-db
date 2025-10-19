// Authentication Manager for MCP
// Implements JWT-based authentication with secure token management

import * as crypto from 'crypto';

export interface AuthConfig {
  secret: string;
  requireAuth: boolean;
  tokenExpiryMs?: number;
  maxTokensPerClient?: number;
}

export interface TokenPayload {
  clientId: string;
  sessionId: string;
  iat: number;
  exp: number;
  permissions: string[];
}

export class AuthManager {
  private activeTokens = new Map<string, { clientId: string; createdAt: number }>();
  private clientTokens = new Map<string, Set<string>>();

  constructor(private config: AuthConfig) {
    // Ensure we have a secret for token signing
    if (!this.config.secret) {
      this.config.secret = this.generateSecret();
    }
    this.config.tokenExpiryMs = this.config.tokenExpiryMs || 24 * 60 * 60 * 1000; // 24 hours
    this.config.maxTokensPerClient = this.config.maxTokensPerClient || 5;
  }

  async validateToken(token: string): Promise<{ valid: boolean; clientId?: string; error?: string }> {
    try {
      // Check if token exists in active tokens
      const tokenInfo = this.activeTokens.get(token);
      if (!tokenInfo) {
        return { valid: false, error: 'Token not found or expired' };
      }

      // Verify token signature
      const [header, payload, signature] = token.split('.');
      const expectedSignature = this.signToken(header, payload);

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid token signature' };
      }

      // Parse and validate payload
      const payloadData: TokenPayload = JSON.parse(Buffer.from(payload, 'base64').toString());

      // Check expiration
      if (Date.now() > payloadData.exp) {
        this.revokeToken(token);
        return { valid: false, error: 'Token expired' };
      }

      // Check if token matches stored client
      if (payloadData.clientId !== tokenInfo.clientId) {
        return { valid: false, error: 'Token client mismatch' };
      }

      return { valid: true, clientId: payloadData.clientId };
    } catch (error) {
      return { valid: false, error: `Token validation failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async createToken(clientId: string, permissions: string[] = ['read', 'query']): Promise<string> {
    // Check token limits
    const clientTokenSet = this.clientTokens.get(clientId) || new Set();
    if (clientTokenSet.size >= (this.config.maxTokensPerClient || 5)) {
      // Revoke oldest token
      const oldestToken = Array.from(clientTokenSet)[0];
      this.revokeToken(oldestToken);
    }

    const sessionId = this.generateSessionId();
    const now = Date.now();
    const payload: TokenPayload = {
      clientId,
      sessionId,
      iat: now,
      exp: now + (this.config.tokenExpiryMs || 24 * 60 * 60 * 1000),
      permissions
    };

    const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
    const payloadStr = JSON.stringify(payload);

    const headerB64 = Buffer.from(header).toString('base64url');
    const payloadB64 = Buffer.from(payloadStr).toString('base64url');
    const signature = this.signToken(headerB64, payloadB64);

    const token = `${headerB64}.${payloadB64}.${signature}`;

    // Store token
    this.activeTokens.set(token, { clientId, createdAt: now });
    clientTokenSet.add(token);
    this.clientTokens.set(clientId, clientTokenSet);

    // Schedule cleanup
    this.scheduleTokenCleanup(token, payload.exp);

    return token;
  }

  async revokeToken(token: string): Promise<boolean> {
    const tokenInfo = this.activeTokens.get(token);
    if (!tokenInfo) return false;

    // Remove from active tokens
    this.activeTokens.delete(token);

    // Remove from client tokens
    const clientTokenSet = this.clientTokens.get(tokenInfo.clientId);
    if (clientTokenSet) {
      clientTokenSet.delete(token);
      if (clientTokenSet.size === 0) {
        this.clientTokens.delete(tokenInfo.clientId);
      }
    }

    return true;
  }

  async revokeAllClientTokens(clientId: string): Promise<number> {
    const clientTokenSet = this.clientTokens.get(clientId);
    if (!clientTokenSet) return 0;

    const tokens = Array.from(clientTokenSet);
    let revokedCount = 0;

    for (const token of tokens) {
      if (await this.revokeToken(token)) {
        revokedCount++;
      }
    }

    return revokedCount;
  }

  getActiveTokenCount(): number {
    return this.activeTokens.size;
  }

  getClientTokenCount(clientId: string): number {
    return this.clientTokens.get(clientId)?.size || 0;
  }

  private signToken(header: string, payload: string): string {
    const data = `${header}.${payload}`;
    const hmac = crypto.createHmac('sha256', this.config.secret);
    return hmac.update(data).digest('base64url');
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private scheduleTokenCleanup(token: string, expiryTime: number): void {
    const timeUntilExpiry = expiryTime - Date.now();
    if (timeUntilExpiry > 0) {
      setTimeout(() => {
        this.revokeToken(token);
      }, timeUntilExpiry);
    }
  }

  // Cleanup expired tokens
  cleanupExpiredTokens(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [token, tokenInfo] of this.activeTokens.entries()) {
      // Parse token to check expiration
      const [, payloadB64] = token.split('.');
      try {
        const payload: TokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (now > payload.exp) {
          this.revokeToken(token);
          cleanedCount++;
        }
      } catch {
        // Invalid token, remove it
        this.revokeToken(token);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}