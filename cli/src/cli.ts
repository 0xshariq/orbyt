#!/usr/bin/env node
/**
 * Orbyt CLI
 * 
 * Command-line interface for the Orbyt workflow automation engine.
 * This is the main entry point for the CLI.
 * 
 * Usage:
 *   orbyt run <workflow>      Execute a workflow
 *   orbyt validate <workflow>  Validate workflow syntax
 *   orbyt explain <workflow>   Show execution plan
 *   orbyt version             Show version
 */

import { Command } from 'commander';
import { registerRunCommand } from './commands/run.js';
import { registerValidateCommand } from './commands/validate.js';

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  // Version is hardcoded for now (TODO: read from package.json)
  const version = '0.1.0';
  
  // Create program
  const program = new Command();
  
  program
    .name('orbyt')
    .description('Universal workflow automation engine')
    .version(version, '-v, --version', 'Show version number')
    .helpOption('-h, --help', 'Show help');

  // Register commands
  registerRunCommand(program);
  registerValidateCommand(program);
  
  // TODO: Add more commands later
  // registerExplainCommand(program);
  // registerAdapterCommand(program);
  // registerEngineCommand(program);

  // Parse arguments
  await program.parseAsync(process.argv);
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(4);
});
