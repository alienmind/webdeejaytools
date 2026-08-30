import { ServiceType } from '../../shared/types.js';
import { IMusicService, ParsedResource } from './base/adapter.js';
import { QobuzServiceAdapter } from './qobuz/adapter.js';
import { SpotifyServiceAdapter } from './spotify/adapter.js';

export class ServiceRegistry {
  private adapters: Map<ServiceType, IMusicService> = new Map();

  constructor() {
    // Register default built-in providers
    this.register(new QobuzServiceAdapter());
    this.register(new SpotifyServiceAdapter());
  }

  /**
   * Register a new music service provider adapter (e.g. Tidal, Deezer, Beatport)
   */
  public register(adapter: IMusicService): void {
    this.adapters.set(adapter.service, adapter);
  }

  /**
   * Retrieve an adapter by its service type identifier
   */
  public get(service: ServiceType): IMusicService {
    const adapter = this.adapters.get(service);
    if (!adapter) {
      throw new Error(`Service provider '${service}' is not registered in the system.`);
    }
    return adapter;
  }

  public has(service: ServiceType): boolean {
    return this.adapters.has(service);
  }

  public getAll(): IMusicService[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Auto-detect and parse URL across all registered service adapters
   */
  public resolveUrl(url: string): { adapter: IMusicService; parsed: ParsedResource } | null {
    for (const adapter of this.adapters.values()) {
      const parsed = adapter.parseUrl(url);
      if (parsed) {
        return { adapter, parsed };
      }
    }
    return null;
  }
}

export const serviceRegistry = new ServiceRegistry();
