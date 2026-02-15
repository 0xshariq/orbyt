/**
 * Formatter Factory
 * 
 * Creates the appropriate formatter based on user options.
 */

import type { Formatter, FormatterOptions } from './Formatter.js';
import { HumanFormatter } from './HumanFormatter.js';
import { VerboseFormatter } from './VerboseFormatter.js';
import { JsonFormatter } from './JsonFormatter.js';
import { NullFormatter } from './NullFormatter.js';

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
      return new VerboseFormatter(options);
    
    case 'json':
      return new JsonFormatter(options);
    
    case 'null':
      return new NullFormatter(options);
    
    default:
      throw new Error(`Unknown formatter type: ${type}`);
  }
}
