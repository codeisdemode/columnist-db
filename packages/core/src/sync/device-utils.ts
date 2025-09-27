import { ColumnistDB, DeviceTableSchema, ColumnistDBError } from '../columnist';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  os: string;
  browser?: string;
  screenResolution?: string;
  language: string;
  timezone: string;
  capabilities: string[];
  createdAt: Date;
  lastSeen: Date;
  syncProtocolVersion: string;
}

export interface DeviceCapabilities {
  offline: boolean;
  realtime: boolean;
  backgroundSync: boolean;
  compression: boolean;
  encryption: boolean;
  largeStorage: boolean;
}

export class DeviceManager {
  private db: ColumnistDB;
  private currentDeviceId: string | null = null;

  constructor(db: ColumnistDB) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    // Ensure device table exists in schema
    await this.ensureDeviceTable();
  }

  /**
   * Ensure device table exists in database schema
   */
  private async ensureDeviceTable(): Promise<void> {
    try {
      const currentSchema = this.db.getSchema();
      if (!currentSchema) {
        throw new ColumnistDBError('Database schema not initialized. Call initialize() first.', 'SCHEMA_NOT_INITIALIZED');
      }
      if (!currentSchema.devices) {
        this.db.defineSchema({
          ...currentSchema,
          devices: DeviceTableSchema
        });
      }
    } catch (error) {
      throw new ColumnistDBError(`Failed to ensure device table: ${error instanceof Error ? error.message : String(error)}`, 'DEVICE_TABLE_INIT_FAILED');
    }
  }

  /**
   * Generate a unique device fingerprint
   */
  private generateDeviceFingerprint(): string {
    // Combine multiple stable identifiers for reliable fingerprinting
    const identifiers: string[] = [];
    
    // User agent and platform info
    if (typeof navigator !== 'undefined') {
      identifiers.push(navigator.userAgent);
      identifiers.push(navigator.platform);
      identifiers.push(navigator.language);
      identifiers.push(navigator.hardwareConcurrency?.toString() || '1');
      
      // Screen properties
      if (screen) {
        identifiers.push(`${screen.width}x${screen.height}`);
        identifiers.push(screen.colorDepth?.toString() || '24');
      }
    }

    // Timezone
    identifiers.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Generate hash from combined identifiers
    const combined = identifiers.join('|');
    return this.hashString(combined);
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Detect device capabilities
   */
  private detectCapabilities(): DeviceCapabilities {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    const isNode = typeof process !== 'undefined' && process.versions?.node;
    
    return {
      offline: isBrowser ? 'serviceWorker' in navigator : true,
      realtime: isBrowser ? 'WebSocket' in window : true,
      backgroundSync: isBrowser ? 'serviceWorker' in navigator && 'sync' in (navigator as any).serviceWorker : false,
      compression: true, // Most environments support compression
      encryption: typeof crypto !== 'undefined' && 'subtle' in crypto,
      largeStorage: isBrowser ? 'storage' in navigator && 'estimate' in navigator.storage : true
    };
  }

  /**
   * Get or create current device info
   */
  async getCurrentDevice(): Promise<DeviceInfo> {
    if (this.currentDeviceId) {
      const device = await this.getDevice(this.currentDeviceId);
      if (device) return device;
    }

    const fingerprint = this.generateDeviceFingerprint();
    const capabilities = this.detectCapabilities();
    
    // Try to find existing device by fingerprint
    const existingDevices = await this.db.find({
      table: 'devices',
      where: { deviceId: fingerprint }
    });

    if (existingDevices.length > 0) {
      this.currentDeviceId = fingerprint;
      return existingDevices[0] as DeviceInfo;
    }

    // Create new device
    const deviceInfo: DeviceInfo = {
      deviceId: fingerprint,
      deviceName: this.generateDeviceName(),
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'node',
      os: this.detectOS(),
      browser: this.detectBrowser(),
      screenResolution: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : undefined,
      language: typeof navigator !== 'undefined' ? navigator.language : 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      capabilities: this.capabilitiesToArray(capabilities),
      createdAt: new Date(),
      lastSeen: new Date(),
      syncProtocolVersion: '1.0'
    };

    await this.db.insert(deviceInfo as unknown as Record<string, unknown>, 'devices');
    this.currentDeviceId = fingerprint;
    
    return deviceInfo;
  }

  /**
   * Generate a friendly device name
   */
  private generateDeviceName(): string {
    const prefixes = ['Swift', 'Smart', 'Mobile', 'Desktop', 'Tablet', 'Laptop'];
    const suffixes = ['Device', 'Machine', 'Unit', 'Terminal', 'Station'];
    
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    return `${randomPrefix} ${randomSuffix}`;
  }

  /**
   * Detect operating system
   */
  private detectOS(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    
    const userAgent = navigator.userAgent;
    if (/windows/i.test(userAgent)) return 'Windows';
    if (/macintosh|mac os x/i.test(userAgent)) return 'macOS';
    if (/linux/i.test(userAgent)) return 'Linux';
    if (/android/i.test(userAgent)) return 'Android';
    if (/ios|iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
    
    return 'Unknown';
  }

  /**
   * Detect browser
   */
  private detectBrowser(): string {
    if (typeof navigator === 'undefined') return 'node';
    
    const userAgent = navigator.userAgent;
    if (/edg/i.test(userAgent)) return 'Edge';
    if (/chrome/i.test(userAgent)) return 'Chrome';
    if (/safari/i.test(userAgent)) return 'Safari';
    if (/firefox/i.test(userAgent)) return 'Firefox';
    if (/opera|opr/i.test(userAgent)) return 'Opera';
    
    return 'Unknown';
  }

  /**
   * Convert capabilities object to string array
   */
  private capabilitiesToArray(capabilities: DeviceCapabilities): string[] {
    return Object.entries(capabilities)
      .filter(([_, value]) => value)
      .map(([key]) => key);
  }

  /**
   * Get device by ID
   */
  async getDevice(deviceId: string): Promise<DeviceInfo | null> {
    const devices = await this.db.find({
      table: 'devices',
      where: { deviceId },
      limit: 1
    });

    return devices.length > 0 ? (devices[0] as DeviceInfo) : null;
  }

  /**
   * Update device last seen timestamp
   */
  async updateLastSeen(deviceId: string): Promise<void> {
    await this.db.update(deviceId as unknown as number, { lastSeen: new Date() }, 'devices');
  }

  /**
   * Get all known devices
   */
  async getAllDevices(): Promise<DeviceInfo[]> {
    const devices = await this.db.find({
      table: 'devices',
      orderBy: { field: 'lastSeen', direction: 'desc' }
    });

    return devices as DeviceInfo[];
  }

  /**
   * Remove a device
   */
  async removeDevice(deviceId: string): Promise<void> {
    await this.db.delete(deviceId as unknown as number, 'devices');
  }

  /**
   * Get current device ID
   */
  getCurrentDeviceId(): string | null {
    return this.currentDeviceId;
  }

  /**
   * Start device presence tracking with heartbeat
   */
  async startPresenceTracking(heartbeatInterval: number = 30000): Promise<void> {
    if (typeof window === 'undefined') {
      console.warn('Presence tracking only available in browser environments');
      return;
    }

    // Initial heartbeat
    await this.updateLastSeen(this.currentDeviceId!);

    // Set up periodic heartbeat
    setInterval(async () => {
      if (this.currentDeviceId) {
        await this.updateLastSeen(this.currentDeviceId);
      }
    }, heartbeatInterval);

    // Track online/offline status
    if (window.addEventListener) {
      window.addEventListener('online', () => {
        this.updateDeviceStatus(this.currentDeviceId!, 'online');
      });

      window.addEventListener('offline', () => {
        this.updateDeviceStatus(this.currentDeviceId!, 'offline');
      });
    }

    console.log('Device presence tracking started');
  }

  /**
   * Update device status (online/offline)
   */
  private async updateDeviceStatus(deviceId: string, status: 'online' | 'offline'): Promise<void> {
    try {
      await this.db.update(deviceId as unknown as number, { 
        status,
        lastStatusChange: new Date()
      }, 'devices');
    } catch (error) {
      console.warn('Failed to update device status:', error);
    }
  }

  /**
   * Get online devices
   */
  async getOnlineDevices(): Promise<DeviceInfo[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const devices = await this.db.find({
      table: 'devices',
      where: {
        lastSeen: { $gte: fiveMinutesAgo }
      }
    });

    return devices as DeviceInfo[];
  }

  /**
   * Get device status (online if last seen within 5 minutes)
   */
  async getDeviceStatus(deviceId: string): Promise<'online' | 'offline'> {
    const device = await this.getDevice(deviceId);
    if (!device) return 'offline';

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return device.lastSeen >= fiveMinutesAgo ? 'online' : 'offline';
  }
}

/**
 * Singleton device manager instance
 */
let deviceManagerInstance: DeviceManager | null = null;

export function getDeviceManager(db?: ColumnistDB): DeviceManager {
  if (!deviceManagerInstance && db) {
    deviceManagerInstance = new DeviceManager(db);
  }
  
  if (!deviceManagerInstance) {
    throw new Error('DeviceManager not initialized. Call getDeviceManager(db) first.');
  }
  
  return deviceManagerInstance;
}