/**
 * Formatter Factory
 * 
 * Creates the appropriate formatter based on user options.
 */

import type { Formatter, FormatterOptions } from './Formatter.js';
import { HumanFormatter } from './HumanFormatter.js';

/**
 * Formatter type
 */
export type FormatterType = 'human' | 'json' | 'verbose' | 'null';

/**
 * Create a formatter instance
 * 
 * @param type - Formatter type
 * @param options - Formatter options
 * @returns Formatter instance
 */
export function createFormatter(
  type: FormatterType = 'human',
  options: FormatterOptions = {}
): Formatter {
  switch (type) {
    case 'human':
      return new HumanFormatter(options);
    
    case 'verbose':
      return new HumanFormatter({ ...options, verbose: true });
    
    case 'json':
      // TODO: Implement JsonFormatter
      throw new Error('JSON formatter not yet implemented');
    
    case 'null':
      // TODO: Implement NullFormatter (for tests/scripts)
      throw new Error('Null formatter not yet implemented');
    
    default:
      throw new Error(`Unknown formatter type: ${type}`);
  }
}
