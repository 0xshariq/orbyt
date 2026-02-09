/**
 * CLI Result Parser
 * 
 * Parses CLI command results and extracts structured data.
 */

export interface ParsedCLIResult<T = unknown> {
  /**
   * Parsed data
   */
  data: T;

  /**
   * Original stdout
   */
  stdout: string;

  /**
   * Original stderr
   */
  stderr: string;

  /**
   * Exit code
   */
  exitCode: number;

  /**
   * Parse errors (if any)
   */
  errors?: string[];
}

export type ResultParser<T = unknown> = (stdout: string, stderr: string, exitCode: number) => T;

export class CLIResultParser {
  /**
   * Parse JSON output
   */
  static parseJSON<T = unknown>(stdout: string, stderr: string, exitCode: number): ParsedCLIResult<T> {
    const errors: string[] = [];
    let data: T = {} as T;

    try {
      data = JSON.parse(stdout);
    } catch (error) {
      errors.push(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { data, stdout, stderr, exitCode, errors };
  }

  /**
   * Parse line-separated output
   */
  static parseLines(stdout: string, stderr: string, exitCode: number): ParsedCLIResult<string[]> {
    const data = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    return { data, stdout, stderr, exitCode };
  }

  /**
   * Parse key-value pairs (KEY=VALUE format)
   */
  static parseKeyValue(stdout: string, stderr: string, exitCode: number): ParsedCLIResult<Record<string, string>> {
    const data: Record<string, string> = {};
    const errors: string[] = [];

    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        data[key.trim()] = value.trim();
      } else {
        errors.push(`Invalid key-value line: ${trimmed}`);
      }
    }

    return { data, stdout, stderr, exitCode, errors };
  }

  /**
   * Parse table output (whitespace-separated columns)
   */
  static parseTable(
    stdout: string,
    stderr: string,
    exitCode: number,
    options: { headers?: boolean; delimiter?: RegExp } = {}
  ): ParsedCLIResult<Array<Record<string, string>>> {
    const { headers = true, delimiter = /\s{2,}|\t/ } = options;
    const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
    
    if (lines.length === 0) {
      return { data: [], stdout, stderr, exitCode };
    }

    let headerLine: string[] = [];
    let dataLines: string[] = [];

    if (headers && lines.length > 0) {
      headerLine = lines[0].split(delimiter).map(h => h.trim());
      dataLines = lines.slice(1);
    } else {
      // Generate column names: col0, col1, ...
      const firstRow = lines[0].split(delimiter);
      headerLine = firstRow.map((_, i) => `col${i}`);
      dataLines = lines;
    }

    const data = dataLines.map(line => {
      const values = line.split(delimiter).map(v => v.trim());
      const row: Record<string, string> = {};
      
      for (let i = 0; i < headerLine.length; i++) {
        row[headerLine[i]] = values[i] || '';
      }
      
      return row;
    });

    return { data, stdout, stderr, exitCode };
  }

  /**
   * Parse with custom parser function
   */
  static parseCustom<T>(
    stdout: string,
    stderr: string,
    exitCode: number,
    parser: ResultParser<T>
  ): ParsedCLIResult<T> {
    try {
      const data = parser(stdout, stderr, exitCode);
      return { data, stdout, stderr, exitCode };
    } catch (error) {
      return {
        data: {} as T,
        stdout,
        stderr,
        exitCode,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * No parsing, return raw output
   */
  static parseRaw(
    stdout: string,
    stderr: string,
    exitCode: number
  ): ParsedCLIResult<{ stdout: string; stderr: string }> {
    return {
      data: { stdout, stderr },
      stdout,
      stderr,
      exitCode,
    };
  }
}
