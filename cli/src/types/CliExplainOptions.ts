/**
 * CLI Explain Command Options
 * 
 * Command-line options for the `orbyt explain` command.
 */

/**
 * CLI explain command options
 */
export interface CliExplainOptions {
  /**
   * Output format
   */
  format?: 'human' | 'json' | 'verbose' | 'null';
  
  /**
   * Show ASCII dependency graph
   */
  graph?: boolean;
  
  /**
   * Verbose output (show detailed configuration,resolved adapters, defaults)
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
