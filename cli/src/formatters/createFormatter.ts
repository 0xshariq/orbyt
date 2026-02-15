/**
 * Formatter Factory
 * 
 * Creates the appropriate formatter based on user options.
 * This is the single point where formatters are instantiated.
 * 
 * Flow:
 * 1. CLI command receives output format option
 * 2. createFormatter() instantiates the correct formatter
 * 3. Formatter receives events and displays them on terminal
 * 4. Logger handles formatting logic (colors, alignment, structure)
 */

import type { Formatter, FormatterOptions } from './Formatter.js';
import { HumanFormatter } from './HumanFormatter.js';
import { VerboseFormatter } from './VerboseFormatter.js';
import { JsonFormatter } from './JsonFormatter.js';
import { NullFormatter } from './NullFormatter.js';

/**
 * Supported formatter types
 */
export type FormatterType = 'human' | 'json' | 'verbose' | 'null';

/**
 * Available formatter types as a set for validation
 */
const VALID_FORMATTER_TYPES: Set<string> = new Set(['human', 'json', 'verbose', 'null']);

/**
 * Create a formatter instance
 * 
 * @param type - Formatter type (human, json, verbose, null)
 * @param options - Formatter options (verbose, noColor, silent)
 * @returns Formatter instance
 * @throws Error if formatter type is unknown
 * 
 * @example
 * ```ts
 * // Create a human-readable formatter
 * const formatter = createFormatter('human', { noColor: false });
 * 
 * // Create a machine-readable JSON formatter
 * const jsonFormatter = createFormatter('json', { verbose: true });
 * 
 * // Create a silent formatter (no output)
 * const nullFormatter = createFormatter('null');
 * ```
 */
export function createFormatter(
  type: FormatterType = 'human',
  options: FormatterOptions = {}
): Formatter {
  // Validate formatter type
  if (!VALID_FORMATTER_TYPES.has(type)) {
    throw new Error(
      `Unknown formatter type: "${type}". Valid types: ${Array.from(VALID_FORMATTER_TYPES).join(', ')}`
    );
  }

  // Create formatter based on type
  switch (type) {
    case 'human':
      return new HumanFormatter(options);
    
    case 'verbose':
      return new VerboseFormatter(options);
    
    case 'json':
      return new JsonFormatter(options);
    
    case 'null':
      return new NullFormatter(options);
    
    default:
      // TypeScript exhaustiveness check - should never reach here
      const exhaustiveCheck: never = type;
      throw new Error(`Unhandled formatter type: ${exhaustiveCheck}`);
  }
}
