/**
 * File System Adapter
 * 
 * Provides file system operations with security controls.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { WorkflowValidationError, OrbytErrorCodes, Adapter,type AdapterContext, AdapterCapabilities, AdapterMetadata, AdapterResultBuilder, type AdapterResult } from '@dev-ecosystem/core';
import { PathSecurityPolicy, PathSecurityConfig } from './PathSecurityPolicy.js';
import { FileResolver } from './FileResolver.js';

export interface FSAdapterConfig {
  security?: PathSecurityConfig;
}

/**
 * File System Adapter
 * 
 * Supported actions:
 * - fs.read: Read file contents
 * - fs.write: Write file contents
 * - fs.append: Append to file
 * - fs.delete: Delete file or directory
 * - fs.copy: Copy file or directory
 * - fs.move: Move/rename file or directory
 * - fs.mkdir: Create directory
 * - fs.list: List directory contents
 * - fs.exists: Check if path exists
 * - fs.stat: Get file/directory stats
 */
export class FSAdapter implements Adapter {
  public readonly name = 'fs';
  public readonly version = '1.0.0';
  public readonly description = 'File system operations with security controls';

  public readonly capabilities: AdapterCapabilities = {
    actions: ['fs.read', 'fs.write', 'fs.append', 'fs.delete', 'fs.copy', 'fs.move', 'fs.mkdir', 'fs.list', 'fs.exists', 'fs.stat'],
    concurrent: true,
    cacheable: false, // File system state can change
    idempotent: false,
    resources: {
      filesystem: true,
    },
    cost: 'low',
  };

  public readonly metadata: AdapterMetadata = {
    name: 'File System Adapter',
    version: '1.0.0',
    author: 'Orbyt Team',
    tags: ['filesystem', 'io', 'files'],
  };

  public readonly supportedActions = ['fs.read', 'fs.write', 'fs.append', 'fs.delete', 'fs.copy', 'fs.move', 'fs.mkdir', 'fs.list', 'fs.exists', 'fs.stat'];

  private securityPolicy: PathSecurityPolicy;

  constructor(config: FSAdapterConfig = {}) {
    this.securityPolicy = new PathSecurityPolicy(process.cwd(), config.security || {});
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async cleanup(): Promise<void> {
    // No cleanup needed
  }

  supports(action: string): boolean {
    return action.startsWith('fs.');
  }

  async execute(action: string, input: Record<string, any>, context: AdapterContext): Promise<AdapterResult> {
    const builder = new AdapterResultBuilder();
    const startTime = Date.now();
    
    // Log execution context for debugging
    context.log(`Executing ${action} in workspace: ${context.cwd || process.cwd()}`, 'info');

    try {
      const workspacePath = context.cwd || process.cwd();
      const resolver = new FileResolver({
        baseDir: workspacePath,
        variables: context.inputs || {},
      });

      let result: unknown;

      switch (action) {
        case 'fs.read':
          result = await this.readFile(input, workspacePath, resolver);
          break;

        case 'fs.write':
          result = await this.writeFile(input, workspacePath, resolver);
          break;

        case 'fs.append':
          result = await this.appendFile(input, workspacePath, resolver);
          break;

        case 'fs.delete':
          result = await this.deleteFile(input, workspacePath, resolver);
          break;

        case 'fs.copy':
          result = await this.copyFile(input, workspacePath, resolver);
          break;

        case 'fs.move':
          result = await this.moveFile(input, workspacePath, resolver);
          break;

        case 'fs.mkdir':
          result = await this.makeDirectory(input, workspacePath, resolver);
          break;

        case 'fs.list':
          result = await this.listDirectory(input, workspacePath, resolver);
          break;

        case 'fs.exists':
          result = await this.checkExists(input, workspacePath, resolver);
          break;

        case 'fs.stat':
          result = await this.getStats(input, workspacePath, resolver);
          break;

        default:
          throw new WorkflowValidationError(
            `Unsupported fs action: ${action}`,
            { action, hint: 'Supported actions: read, write, append, delete, copy, move, mkdir, list, exists, stat' }
          );
      }

      return builder
        .success(result)
        .effect(`filesystem:${action.replace('fs.', '')}`)
        .metrics({
          durationMs: Date.now() - startTime,
        })
        .build();
    } catch (error) {
      const err = error as Error;
      const errorCode = (error as any).code || OrbytErrorCodes.ADAPTER_EXECUTION_FAILED;
      return builder
        .failure({
          code: errorCode,
          message: err.message,
        })
        .metrics({
          durationMs: Date.now() - startTime,
        })
        .build();
    }
  }

  private async readFile(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ path: string; content: string; encoding: string }> {
    const filePath = input.path as string;
    const encoding = (input.encoding as BufferEncoding) || 'utf-8';

    if (!filePath) {
      throw new WorkflowValidationError(
        'Missing required parameter: path',
        { parameter: 'path', workspacePath }
      );
    }

    const resolvedPath = await resolver.resolvePath(filePath);
    const validatedPath = await this.securityPolicy.validatePath(resolvedPath);
    const content = await fs.readFile(validatedPath, encoding);

    return { path: validatedPath, content, encoding };
  }

  private async writeFile(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ path: string; bytesWritten: number }> {
    const filePath = input.path as string;
    const content = input.content as string;
    const encoding = (input.encoding as BufferEncoding) || 'utf-8';

    if (!filePath || content === undefined) {
      throw new WorkflowValidationError(
        'Missing required parameters: path, content',
        { parameters: ['path', 'content'], workspacePath }
      );
    }

    const resolvedPath = await resolver.resolvePath(filePath);
    const validatedPath = await this.securityPolicy.validatePath(resolvedPath);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(validatedPath), { recursive: true });

    await fs.writeFile(validatedPath, content, encoding);
    const stats = await fs.stat(validatedPath);

    return { path: validatedPath, bytesWritten: stats.size };
  }

  private async appendFile(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ path: string; bytesWritten: number }> {
    const filePath = input.path as string;
    const content = input.content as string;
    const encoding = (input.encoding as BufferEncoding) || 'utf-8';

    if (!filePath || content === undefined) {
      throw new WorkflowValidationError(
        'Missing required parameters: path, content',
        { parameters: ['path', 'content'], workspacePath }
      );
    }

    const resolvedPath = await resolver.resolvePath(filePath);
    const validatedPath = await this.securityPolicy.validatePath(resolvedPath);

    await fs.appendFile(validatedPath, content, encoding);
    const stats = await fs.stat(validatedPath);

    return { path: validatedPath, bytesWritten: stats.size };
  }

  private async deleteFile(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ path: string; deleted: boolean }> {
    const filePath = input.path as string;
    const recursive = input.recursive === true;

    if (!filePath) {
      throw new WorkflowValidationError(
        'Missing required parameter: path',
        { parameter: 'path', workspacePath }
      );
    }

    const resolvedPath = await resolver.resolvePath(filePath);
    const validatedPath = await this.securityPolicy.validatePath(resolvedPath);

    await fs.rm(validatedPath, { recursive, force: false });

    return { path: validatedPath, deleted: true };
  }

  private async copyFile(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ source: string; destination: string }> {
    const source = input.source as string;
    const destination = input.destination as string;

    if (!source || !destination) {
      throw new WorkflowValidationError(
        'Missing required parameters: source, destination',
        { parameters: ['source', 'destination'], workspacePath }
      );
    }

    const resolvedSource = await resolver.resolvePath(source);
    const resolvedDest = await resolver.resolvePath(destination);

    const validatedSource = await this.securityPolicy.validatePath(resolvedSource);
    const validatedDest = await this.securityPolicy.validatePath(resolvedDest);

    // Ensure destination directory exists
    await fs.mkdir(path.dirname(validatedDest), { recursive: true });

    await fs.copyFile(validatedSource, validatedDest);

    return { source: validatedSource, destination: validatedDest };
  }

  private async moveFile(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ source: string; destination: string }> {
    const source = input.source as string;
    const destination = input.destination as string;

    if (!source || !destination) {
      throw new WorkflowValidationError(
        'Missing required parameters: source, destination',
        { parameters: ['source', 'destination'], workspacePath }
      );
    }

    const resolvedSource = await resolver.resolvePath(source);
    const resolvedDest = await resolver.resolvePath(destination);

    const validatedSource = await this.securityPolicy.validatePath(resolvedSource);
    const validatedDest = await this.securityPolicy.validatePath(resolvedDest);

    // Ensure destination directory exists
    await fs.mkdir(path.dirname(validatedDest), { recursive: true });

    await fs.rename(validatedSource, validatedDest);

    return { source: validatedSource, destination: validatedDest };
  }

  private async makeDirectory(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ path: string; created: boolean }> {
    const dirPath = input.path as string;
    const recursive = input.recursive !== false; // Default to true

    if (!dirPath) {
      throw new WorkflowValidationError(
        'Missing required parameter: path',
        { parameter: 'path', workspacePath }
      );
    }

    const resolvedPath = await resolver.resolvePath(dirPath);
    const validatedPath = await this.securityPolicy.validatePath(resolvedPath);

    await fs.mkdir(validatedPath, { recursive });

    return { path: validatedPath, created: true };
  }

  private async listDirectory(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ path: string; entries: Array<{ name: string; type: string }> }> {
    const dirPath = input.path as string || '.';
    const recursive = input.recursive === true;

    const resolvedPath = await resolver.resolvePath(dirPath);
    const validatedPath = await this.securityPolicy.validatePath(resolvedPath);

    const entries = await fs.readdir(validatedPath, { withFileTypes: true });
    const result: Array<{ name: string; type: string }> = [];

    for (const entry of entries) {
      result.push({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
      });

      if (recursive && entry.isDirectory()) {
        const subDir = path.join(dirPath, entry.name);
        const subEntries = await this.listDirectory(
          { path: subDir, recursive },
          workspacePath,
          resolver
        );
        result.push(
          ...subEntries.entries.map(e => ({
            name: path.join(entry.name, e.name),
            type: e.type,
          }))
        );
      }
    }

    return { path: validatedPath, entries: result };
  }

  private async checkExists(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ path: string; exists: boolean }> {
    const filePath = input.path as string;

    if (!filePath) {
      throw new WorkflowValidationError(
        'Missing required parameter: path',
        { parameter: 'path', workspacePath }
      );
    }

    const resolvedPath = await resolver.resolvePath(filePath);
    // Don't validate path for exists check (it might not exist)

    try {
      await fs.access(resolvedPath);
      return { path: resolvedPath, exists: true };
    } catch {
      return { path: resolvedPath, exists: false };
    }
  }

  private async getStats(
    input: Record<string, any>,
    workspacePath: string,
    resolver: FileResolver
  ): Promise<{ path: string; stats: Record<string, unknown> }> {
    const filePath = input.path as string;

    if (!filePath) {
      throw new WorkflowValidationError(
        'Missing required parameter: path',
        { parameter: 'path', workspacePath }
      );
    }

    const resolvedPath = await resolver.resolvePath(filePath);
    const validatedPath = await this.securityPolicy.validatePath(resolvedPath);

    const stats = await fs.stat(validatedPath);

    return {
      path: validatedPath,
      stats: {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        accessedAt: stats.atime.toISOString(),
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
      },
    };
  }
}
