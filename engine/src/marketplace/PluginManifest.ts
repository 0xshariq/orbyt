/**
 * Plugin Manifest
 * 
 * Defines structure for plugin metadata and capabilities.
 * Used by marketplace to discover and load plugins.
 * 
 * @module marketplace
 * @status stub - will be implemented for v2 marketplace
 */

/**
 * Plugin manifest schema
 */
export interface PluginManifest {
  /** Plugin name */
  name: string;
  
  /** Plugin version (semver) */
  version: string;
  
  /** Plugin description */
  description: string;
  
  /** Plugin author */
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  
  /** Engine version compatibility */
  engineVersion: string;
  
  /** Plugin capabilities */
  capabilities: {
    /** Adapters provided by plugin */
    adapters?: string[];
    
    /** Triggers provided by plugin */
    triggers?: string[];
    
    /** Hooks provided by plugin */
    hooks?: string[];
  };
  
  /** Required permissions */
  permissions: string[];
  
  /** Plugin entry point */
  main: string;
  
  /** Plugin dependencies */
  dependencies?: Record<string, string>;
  
  /** Plugin keywords */
  keywords?: string[];
  
  /** Plugin license */
  license?: string;
  
  /** Plugin repository */
  repository?: {
    type: string;
    url: string;
  };
}

/**
 * Parse plugin manifest from JSON
 * 
 * @param json - Manifest JSON string
 * @returns Parsed manifest
 */
export function parseManifest(json: string): PluginManifest {
  const manifest = JSON.parse(json);
  
  // Validate required fields
  if (!manifest.name || !manifest.version || !manifest.main) {
    throw new Error('Invalid plugin manifest: missing required fields');
  }
  
  return manifest as PluginManifest;
}

/**
 * Validate plugin manifest structure
 * 
 * @param manifest - Manifest to validate
 * @returns True if valid
 */
export function validateManifest(manifest: PluginManifest): boolean {
  if (!manifest.name || typeof manifest.name !== 'string') {
    return false;
  }
  
  if (!manifest.version || typeof manifest.version !== 'string') {
    return false;
  }
  
  if (!manifest.main || typeof manifest.main !== 'string') {
    return false;
  }
  
  // Version should be semver
  const semverRegex = /^\d+\.\d+\.\d+/;
  if (!semverRegex.test(manifest.version)) {
    return false;
  }
  
  return true;
}

/**
 * Create minimal manifest template
 * 
 * @param name - Plugin name
 * @returns Manifest template
 */
export function createManifestTemplate(name: string): PluginManifest {
  return {
    name,
    version: '0.1.0',
    description: '',
    author: {
      name: '',
    },
    engineVersion: '^0.1.0',
    capabilities: {},
    permissions: [],
    main: 'dist/index.js',
  };
}
