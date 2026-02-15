/**
 * CLI Validate Command Options
 * 
 * Command-line options for the `orbyt validate` command.
 */

/**
 * CLI validate command options
 */
export interface CliValidateOptions {
  /**
   * Output format
   */
  format?: 'human' | 'json' | 'verbose' | 'null';
  
  /**
   * Verbose output (show more details like step count, capabilities)
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
