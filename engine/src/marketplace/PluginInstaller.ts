/**
 * Plugin Installer
 * 
 * Handles installation and management of Orbyt plugins.
 * Downloads, verifies, and registers plugins.
 * 
 * @module marketplace
 * @status stub - will be implemented for v2 marketplace
 */

import type { PluginManifest } from './PluginManifest.js';
import { PluginVerifier } from './PluginVerifier.js';

/**
 * Installation options
 */
export interface InstallOptions {
  /** Plugin source (npm package name, git url, local path) */
  source: string;
  
  /** Skip verification */
  skipVerify?: boolean;
  
  /** Force reinstall */
  force?: boolean;
}

/**
 * Installed plugin info
 */
export interface InstalledPlugin {
  /** Plugin manifest */
  manifest: PluginManifest;
  
  /** Installation path */
  path: string;
  
  /** Installation timestamp */
  installedAt: Date;
  
  /** Is enabled */
  enabled: boolean;
}

/**
 * Plugin Installer
 * 
 * Future: Will handle plugin installation from marketplace/npm/git
 */
export class PluginInstaller {
  private installedPlugins = new Map<string, InstalledPlugin>();
  private verifier = new PluginVerifier();

  /**
   * Install a plugin
   * 
   * @param options - Installation options
   * @returns Installed plugin info
   */
  async install(options: InstallOptions): Promise<InstalledPlugin> {
    // TODO: Implement actual plugin installation
    // - Download from npm/git/local
    // - Verify signature and integrity
    // - Extract and validate manifest
    // - Install dependencies
    // - Register plugin
    
    console.log(`[PluginInstaller] Installing plugin from: ${options.source}`);
    
    throw new Error('Plugin installation not yet implemented - coming in v2');
  }

  /**
   * Uninstall a plugin
   * 
   * @param pluginName - Plugin name to uninstall
   */
  async uninstall(pluginName: string): Promise<void> {
    const plugin = this.installedPlugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    // TODO: Implement cleanup
    this.installedPlugins.delete(pluginName);
  }

  /**
   * List installed plugins
   * 
   * @returns Array of installed plugins
   */
  list(): InstalledPlugin[] {
    return Array.from(this.installedPlugins.values());
  }

  /**
   * Enable a plugin
   * 
   * @param pluginName - Plugin name
   */
  async enable(pluginName: string): Promise<void> {
    const plugin = this.installedPlugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    plugin.enabled = true;
  }

  /**
   * Disable a plugin
   * 
   * @param pluginName - Plugin name
   */
  async disable(pluginName: string): Promise<void> {
    const plugin = this.installedPlugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    plugin.enabled = false;
  }

  /**
   * Check if plugin is installed
   * 
   * @param pluginName - Plugin name
   * @returns True if installed
   */
  isInstalled(pluginName: string): boolean {
    return this.installedPlugins.has(pluginName);
  }
}
