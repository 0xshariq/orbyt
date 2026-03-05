import type { ExplainFormatter } from '../Formatter.js';
import { ExplainHumanFormatter } from './ExplainHumanFormatter.js';
import { ExplainVerboseFormatter } from './ExplainVerboseFormatter.js';
import { ExplainJsonFormatter } from './ExplainJsonFormatter.js';
import type { CliExplainOptions } from '../../types/CliExplainOptions.js';

export type ExplainFormatterType = 'human' | 'json' | 'verbose';

const VALID_EXPLAIN_FORMATTER_TYPES: Set<string> = new Set(['human', 'json', 'verbose']);

export function createExplainFormatter(
  type: ExplainFormatterType = 'human',
  options: CliExplainOptions = {}
): ExplainFormatter {
  if (!VALID_EXPLAIN_FORMATTER_TYPES.has(type)) {
    throw new Error(
      `Unknown explain formatter type: "${type}". Valid types: ${Array.from(VALID_EXPLAIN_FORMATTER_TYPES).join(', ')}`
    );
  }

  switch (type) {
    case 'human':
      return new ExplainHumanFormatter(options);
    case 'verbose':
      return new ExplainVerboseFormatter(options);
    case 'json':
      return new ExplainJsonFormatter(options);
    default:
      const exhaustiveCheck: never = type;
      throw new Error(`Unhandled explain formatter type: ${exhaustiveCheck}`);
  }
}
