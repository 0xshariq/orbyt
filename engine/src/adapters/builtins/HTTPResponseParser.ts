/**
 * HTTP Response Parser
 * 
 * Parses HTTP responses and extracts structured data.
 */

export interface ParsedHTTPResponse<T = unknown> {
  /**
   * Parsed data
   */
  data: T;

  /**
   * Response status code
   */
  status: number;

  /**
   * Response headers
   */
  headers: Record<string, string>;

  /**
   * Content type
   */
  contentType?: string;

  /**
   * Parse errors (if any)
   */
  errors?: string[];
}

export class HTTPResponseParser {
  /**
   * Parse response based on Content-Type
   */
  static async parseAuto(response: Response): Promise<ParsedHTTPResponse> {
    const contentType = response.headers.get('content-type') || '';
    const headers = this.extractHeaders(response);

    if (contentType.includes('application/json')) {
      return this.parseJSON(response, headers);
    } else if (contentType.includes('text/')) {
      return this.parseText(response, headers);
    } else if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
      return this.parseText(response, headers); // Return XML as text
    } else {
      return this.parseBinary(response, headers);
    }
  }

  /**
   * Parse JSON response
   */
  static async parseJSON<T = unknown>(response: Response, headers?: Record<string, string>): Promise<ParsedHTTPResponse<T>> {
    const extractedHeaders = headers || this.extractHeaders(response);
    const errors: string[] = [];
    let data: T | undefined = undefined;

    try {
      data = await response.json() as T;
    } catch (error) {
      errors.push(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      data: data as T,
      status: response.status,
      headers: extractedHeaders,
      contentType: response.headers.get('content-type') || undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Parse text response
   */
  static async parseText(response: Response, headers?: Record<string, string>): Promise<ParsedHTTPResponse<string>> {
    const extractedHeaders = headers || this.extractHeaders(response);
    const data = await response.text();

    return {
      data,
      status: response.status,
      headers: extractedHeaders,
      contentType: response.headers.get('content-type') || undefined,
    };
  }

  /**
   * Parse binary response (returns base64-encoded string)
   */
  static async parseBinary(response: Response, headers?: Record<string, string>): Promise<ParsedHTTPResponse<string>> {
    const extractedHeaders = headers || this.extractHeaders(response);
    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer).toString('base64');

    return {
      data,
      status: response.status,
      headers: extractedHeaders,
      contentType: response.headers.get('content-type') || undefined,
    };
  }

  /**
   * Parse form data response
   */
  static async parseFormData(response: Response, headers?: Record<string, string>): Promise<ParsedHTTPResponse<Record<string, string>>> {
    const extractedHeaders = headers || this.extractHeaders(response);
    const formData = await response.formData();
    const data: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      data[key] = String(value);
    }

    return {
      data,
      status: response.status,
      headers: extractedHeaders,
      contentType: response.headers.get('content-type') || undefined,
    };
  }

  /**
   * Extract headers from response
   */
  private static extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};

    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return headers;
  }

  /**
   * Check if response is successful (2xx status)
   */
  static isSuccess(response: Response): boolean {
    return response.status >= 200 && response.status < 300;
  }

  /**
   * Check if response is a redirect (3xx status)
   */
  static isRedirect(response: Response): boolean {
    return response.status >= 300 && response.status < 400;
  }

  /**
   * Check if response is a client error (4xx status)
   */
  static isClientError(response: Response): boolean {
    return response.status >= 400 && response.status < 500;
  }

  /**
   * Check if response is a server error (5xx status)
   */
  static isServerError(response: Response): boolean {
    return response.status >= 500 && response.status < 600;
  }

  /**
   * Get response status text
   */
  static getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };

    return statusTexts[status] || 'Unknown Status';
  }
}
