/**
 * CLI Run Command Options
 * 
 * Command-line options for the `orbyt run` command.
 */

/**
 * CLI run command options
 */
export interface CliRunOptions {
  /**
   * Workflow input variables (key=value format)
   * Example: ['var1=value1', 'var2=value2']
   */
  vars?: string[];
  
  /**
   * Path to variables file (JSON or YAML)
   */
  varsFile?: string;
  
  /**
   * Environment variables to set
   */
  env?: string[];
  
  /**
   * Path to environment file (.env style)
   */
  envFile?: string;
  
  /**
   * Execution timeout in seconds
   */
  timeout?: number;
  
  /**
   * Continue execution even if steps fail
   */
  continueOnError?: boolean;
  
  /**
   * Dry run mode - validate and plan without execution
   */
  dryRun?: boolean;
  
  /**
   * Output format
   */
  format?: 'human' | 'json' | 'verbose' | 'null';
  
  /**
   * Verbose output (show more details)
   */
  verbose?: boolean;
  
  /**
   * Silent mode (minimal output)
   */
  silent?: boolean;
  
  /**
   * No color in output
   */
  noColor?: boolean;
}

/**
 * Parse key=value pairs into object
 */
export function parseKeyValuePairs(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index === -1) {
      throw new Error(`Invalid key=value format: ${pair}`);
    }
    
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    
    if (!key) {
      throw new Error(`Empty key in: ${pair}`);
    }
    
    result[key] = value;
  }
  
  return result;
}
