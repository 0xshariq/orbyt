/**
 * Shell Security Policy
 * 
 * Security controls for shell command execution.
 */

import { AdapterExecutionError } from '@dev-ecosystem/core';

export interface ShellSecurityConfig {
  /**
   * Blocked commands (exact matches)
   */
  blockedCommands?: string[];

  /**
   * Blocked patterns (regex)
   */
  blockedPatterns?: RegExp[];

  /**
   * Allowed commands (whitelist)
   */
  allowedCommands?: string[];

  /**
   * Allow dangerous operations (rm, del, format, etc.)
   */
  allowDangerousOperations?: boolean;

  /**
   * Allow command chaining (&&, ||, ;)
   */
  allowCommandChaining?: boolean;

  /**
   * Allow environment variable expansion
   */
  allowEnvExpansion?: boolean;

  /**
   * Maximum command length
   */
  maxCommandLength?: number;
}

export class ShellSecurityPolicy {
  private config: Required<ShellSecurityConfig>;

  private static DANGEROUS_COMMANDS = [
    'rm',
    'rmdir',
    'del',
    'delete',
    'format',
    'fdisk',
    'mkfs',
    'dd',
    'shred',
    ':(){:|:&};:',  // Fork bomb
  ];

  private static DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//i,           // rm -rf /
    />\s*\/dev\/(sd|hd|nvme)/i, // Write to disk device
    /mkfs/i,                     // Format filesystem
    /dd\s+if=/i,                // Disk dump
    /curl.*\|\s*sh/i,           // Pipe to shell
    /wget.*\|\s*sh/i,           // Pipe to shell
  ];

  constructor(config: ShellSecurityConfig = {}) {
    this.config = {
      blockedCommands: config.blockedCommands || [],
      blockedPatterns: config.blockedPatterns || [],
      allowedCommands: config.allowedCommands || [],
      allowDangerousOperations: config.allowDangerousOperations ?? false,
      allowCommandChaining: config.allowCommandChaining ?? true,
      allowEnvExpansion: config.allowEnvExpansion ?? true,
      maxCommandLength: config.maxCommandLength ?? 10000,
    };
  }

  /**
   * Validate a shell command
   */
  validate(command: string): void {
    // Check command length
    if (command.length > this.config.maxCommandLength) {
      throw new AdapterExecutionError(
        `Command exceeds maximum length of ${this.config.maxCommandLength}`,
        { hint: 'Break command into smaller parts or increase maxCommandLength' }
      );
    }

    // Extract base command
    const baseCommand = this.extractBaseCommand(command);

    // Check whitelist
    if (this.config.allowedCommands.length > 0) {
      if (!this.config.allowedCommands.includes(baseCommand)) {
        throw new AdapterExecutionError(
          `Command not in allowed list: ${baseCommand}`,
          { hint: 'Add command to allowedCommands or remove whitelist' }
        );
      }
    }

    // Check blocked commands
    if (this.config.blockedCommands.includes(baseCommand)) {
      throw new AdapterExecutionError(
        `Command is blocked: ${baseCommand}`,
        { hint: 'This command is explicitly blocked by security policy' }
      );
    }

    // Check dangerous commands
    if (!this.config.allowDangerousOperations) {
      if (ShellSecurityPolicy.DANGEROUS_COMMANDS.includes(baseCommand)) {
        throw new AdapterExecutionError(
          `Dangerous command detected: ${baseCommand}`,
          { hint: 'Enable allowDangerousOperations to use this command' }
        );
      }
    }

    // Check dangerous patterns
    if (!this.config.allowDangerousOperations) {
      for (const pattern of ShellSecurityPolicy.DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          throw new AdapterExecutionError(
            'Dangerous command pattern detected',
            { pattern: pattern.toString(), hint: 'Enable allowDangerousOperations to use this pattern' }
          );
        }
      }
    }

    // Check blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(command)) {
        throw new AdapterExecutionError(
          'Command matches blocked pattern',
          { pattern: pattern.toString() }
        );
      }
    }

    // Check command chaining
    if (!this.config.allowCommandChaining) {
      if (this.hasCommandChaining(command)) {
        throw new AdapterExecutionError(
          'Command chaining is not allowed',
          { hint: 'Enable allowCommandChaining or split commands' }
        );
      }
    }

    // Check environment variable expansion
    if (!this.config.allowEnvExpansion) {
      if (command.includes('$')) {
        throw new AdapterExecutionError(
          'Environment variable expansion is not allowed',
          { hint: 'Enable allowEnvExpansion or use literal values' }
        );
      }
    }
  }

  /**
   * Extract base command from command string
   */
  private extractBaseCommand(command: string): string {
    // Remove leading/trailing whitespace
    const trimmed = command.trim();

    // Extract first word (command name)
    const match = trimmed.match(/^([^\s&|;]+)/);
    if (!match) return '';

    const cmd = match[1];

    // Remove path and get just the command name
    const parts = cmd.split(/[/\\]/);
    return parts[parts.length - 1];
  }

  /**
   * Check for command chaining
   */
  private hasCommandChaining(command: string): boolean {
    // Check for &&, ||, ;, | (pipe)
    return /[;&|]{1,2}/.test(command);
  }

  /**
   * Get warnings for a command (non-blocking)
   */
  getWarnings(command: string): string[] {
    const warnings: string[] = [];

    if (command.includes('sudo') || command.includes('su ')) {
      warnings.push('Command uses privilege escalation (sudo/su)');
    }

    if (command.includes('rm ') || command.includes('del ')) {
      warnings.push('Command performs file deletion');
    }

    if (command.includes('curl') || command.includes('wget')) {
      warnings.push('Command makes network requests');
    }

    if (command.length > 500) {
      warnings.push('Command is unusually long');
    }

    return warnings;
  }
}
