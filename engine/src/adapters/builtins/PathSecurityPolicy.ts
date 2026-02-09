/**
 * Path Security Policy
 * 
 * Security checks for file system operations.
 */

import { resolve, normalize, isAbsolute } from 'path';
import { AdapterExecutionError } from '@dev-ecosystem/core';

export interface PathSecurityConfig {
  /** Allowed base directories for file operations */
  allowedPaths?: string[];
  /** Blocked directories (e.g., system directories) */
  blockedPaths?: string[];
  /** Allow operations outside workspace */
  allowOutsideWorkspace?: boolean;
  /** Maximum path depth from workspace root */
  maxDepth?: number;
  /** Allow symlinks */
  allowSymlinks?: boolean;
  /** Allow hidden files (starting with .) */
  allowHiddenFiles?: boolean;
}

export class PathSecurityPolicy {
  private readonly config: Required<PathSecurityConfig>;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string, config: PathSecurityConfig = {}) {
    this.workspaceRoot = normalize(resolve(workspaceRoot));
    this.config = {
      allowedPaths: config.allowedPaths || [this.workspaceRoot],
      blockedPaths: config.blockedPaths || [
        '/etc',
        '/sys',
        '/proc',
        '/dev',
        '/root',
        '/boot',
        'C:\\Windows',
        'C:\\Program Files',
      ],
      allowOutsideWorkspace: config.allowOutsideWorkspace ?? false,
      maxDepth: config.maxDepth ?? 100,
      allowSymlinks: config.allowSymlinks ?? false,
      allowHiddenFiles: config.allowHiddenFiles ?? true,
    };
  }

  /**
   * Validate and resolve a path
   * @throws AdapterExecutionError if path is not allowed
   */
  validatePath(inputPath: string): string {
    // Normalize and resolve path
    const resolvedPath = normalize(resolve(this.workspaceRoot, inputPath));

    // Check if path is absolute when it shouldn't be
    if (isAbsolute(inputPath) && !this.config.allowOutsideWorkspace) {
      throw new AdapterExecutionError(
        'Absolute paths are not allowed',
        { path: inputPath, workspaceRoot: this.workspaceRoot, hint: 'Use relative paths from workspace root' }
      );
    }

    // Check if path is within workspace
    if (!this.config.allowOutsideWorkspace && !resolvedPath.startsWith(this.workspaceRoot)) {
      throw new AdapterExecutionError(
        'Path is outside workspace root',
        { path: resolvedPath, workspaceRoot: this.workspaceRoot, hint: 'Enable allowOutsideWorkspace or use paths within workspace' }
      );
    }

    // Check blocked paths
    for (const blockedPath of this.config.blockedPaths) {
      if (resolvedPath.startsWith(normalize(blockedPath))) {
        throw new AdapterExecutionError(
          'Path is in a blocked directory',
          { path: resolvedPath, blockedPath, hint: 'This directory is blocked for security reasons' }
        );
      }
    }

    // Check allowed paths if specified
    if (this.config.allowedPaths.length > 0) {
      const isAllowed = this.config.allowedPaths.some(allowedPath =>
        resolvedPath.startsWith(normalize(resolve(allowedPath)))
      );
      if (!isAllowed) {
        throw new AdapterExecutionError(
          'Path is not in allowed directories',
          { path: resolvedPath, allowedPaths: this.config.allowedPaths, hint: 'Check allowedPaths configuration' }
        );
      }
    }

    // Check path depth
    const relativePath = resolvedPath.replace(this.workspaceRoot, '');
    const depth = relativePath.split(/[/\\]/).filter(Boolean).length;
    if (depth > this.config.maxDepth) {
      throw new AdapterExecutionError(
        'Path depth exceeds maximum allowed',
        { path: resolvedPath, depth, maxDepth: this.config.maxDepth, hint: `Maximum depth: ${this.config.maxDepth}` }
      );
    }

    // Check hidden files
    if (!this.config.allowHiddenFiles) {
      const pathParts = resolvedPath.split(/[/\\]/);
      const hasHiddenPart = pathParts.some(part => part.startsWith('.') && part !== '.');
      if (hasHiddenPart) {
        throw new AdapterExecutionError(
          'Hidden files/directories are not allowed',
          { path: resolvedPath, hint: 'Enable allowHiddenFiles or avoid hidden paths' }
        );
      }
    }

    // Check for path traversal attempts
    if (inputPath.includes('..')) {
      const normalized = normalize(inputPath);
      if (normalized.includes('..')) {
        throw new AdapterExecutionError(
          'Path traversal detected',
          { path: inputPath, hint: 'Avoid using .. in paths' }
        );
      }
    }

    return resolvedPath;
  }

  /**
   * Check if operation is allowed for the given path
   */
  isOperationAllowed(path: string, operation: 'read' | 'write' | 'delete' | 'execute'): boolean {
    try {
      this.validatePath(path);
      
      // Additional operation-specific checks
      if (operation === 'delete' || operation === 'write') {
        // More restrictive checks for destructive operations
        // Prevent deletion/writing to critical directories
        const criticalPaths = ['/etc', '/sys', '/proc', '/dev', '/root', '/boot'];
        for (const criticalPath of criticalPaths) {
          if (path.startsWith(criticalPath)) {
            return false;
          }
        }
      }
      
      if (operation === 'execute') {
        // Prevent execution of files in certain directories
        const noExecPaths = ['/tmp', '/var/tmp'];
        for (const noExecPath of noExecPaths) {
          if (path.startsWith(noExecPath)) {
            return false;
          }
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get relative path from workspace root
   */
  getRelativePath(absolutePath: string): string {
    const normalized = normalize(absolutePath);
    if (normalized.startsWith(this.workspaceRoot)) {
      return normalized.substring(this.workspaceRoot.length + 1);
    }
    return absolutePath;
  }
}
