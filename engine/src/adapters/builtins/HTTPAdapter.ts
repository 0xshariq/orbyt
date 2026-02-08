/**
 * HTTP Adapter
 * 
 * Executes HTTP requests.
 * 
 * Supported actions:
 *   - http.request.get
 *   - http.request.post
 *   - http.request.put
 *   - http.request.patch
 *   - http.request.delete
 *   - http.request.head
 *   - http.request.options
 * 
 * @module adapters/builtins
 */

import { BaseAdapter, type AdapterContext } from '../Adapter.js';

/**
 * HTTP request/response types
 */
interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  url: string;
  duration: number;
}

/**
 * HTTP adapter for making HTTP requests
 */
export class HTTPAdapter extends BaseAdapter {
  readonly name = 'http';
  readonly version = '1.0.0';
  readonly description = 'HTTP request adapter';
  readonly supportedActions = ['http.request.*'];

  async execute(
    action: string,
    input: Record<string, any>,
    context: AdapterContext
  ): Promise<HTTPResponse> {
    // Validate required inputs
    this.validateInput(input, ['url']);

    // Extract method from action (http.request.get -> GET)
    const method = this.extractMethod(action);

    // Build request options
    const requestOptions = this.buildRequestOptions(method, input);

    // Execute request
    const startTime = Date.now();
    
    try {
      const response = await fetch(input.url, requestOptions);
      const duration = Date.now() - startTime;

      // Parse response body
      const body = await this.parseResponseBody(response, input);

      // Convert headers to plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const result: HTTPResponse = {
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
        url: response.url,
        duration,
      };

      // Log request
      context.log(
        `HTTP ${method} ${input.url} -> ${response.status} (${duration}ms)`
      );

      // Check if we should throw on error status
      const throwOnError = this.getInput(input, 'throwOnError', true);
      if (throwOnError && !response.ok) {
        throw new Error(
          `HTTP request failed: ${response.status} ${response.statusText}`
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      context.log(
        `HTTP ${method} ${input.url} failed after ${duration}ms: ${error}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * Extract HTTP method from action
   */
  private extractMethod(action: string): string {
    const parts = action.split('.');
    const method = parts[parts.length - 1];
    return method.toUpperCase();
  }

  /**
   * Build fetch request options
   */
  private buildRequestOptions(
    method: string,
    input: Record<string, any>
  ): RequestInit {
    const options: RequestInit = {
      method,
      headers: this.buildHeaders(input),
    };

    // Add body for POST, PUT, PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      if (input.body) {
        options.body = this.serializeBody(input.body, input.headers);
      } else if (input.json) {
        options.body = JSON.stringify(input.json);
      } else if (input.form) {
        options.body = new URLSearchParams(input.form).toString();
      }
    }

    // Add other options
    if (input.mode) options.mode = input.mode;
    if (input.credentials) options.credentials = input.credentials;
    if (input.cache) options.cache = input.cache;
    if (input.redirect) options.redirect = input.redirect;
    if (input.referrer) options.referrer = input.referrer;
    if (input.integrity) options.integrity = input.integrity;

    return options;
  }

  /**
   * Build request headers
   */
  private buildHeaders(input: Record<string, any>): Record<string, string> {
    const headers: Record<string, string> = input.headers || {};

    // Auto-set Content-Type if not provided
    if (input.json && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (input.form && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    // Add auth header if provided
    if (input.auth) {
      if (input.auth.bearer) {
        headers['Authorization'] = `Bearer ${input.auth.bearer}`;
      } else if (input.auth.basic) {
        const encoded = btoa(
          `${input.auth.basic.username}:${input.auth.basic.password}`
        );
        headers['Authorization'] = `Basic ${encoded}`;
      }
    }

    return headers;
  }

  /**
   * Serialize request body
   */
  private serializeBody(body: any, headers?: Record<string, string>): string {
    const contentType = headers?.['Content-Type'] || headers?.['content-type'];

    if (contentType?.includes('application/json')) {
      return JSON.stringify(body);
    }

    if (typeof body === 'string') {
      return body;
    }

    return JSON.stringify(body);
  }

  /**
   * Parse response body based on content type
   */
  private async parseResponseBody(
    response: Response,
    input: Record<string, any>
  ): Promise<any> {
    const responseType: string = this.getInput(input, 'responseType', 'auto');
    const contentType = response.headers.get('content-type') || '';

    // Explicit response type
    if (responseType === 'json') {
      return response.json();
    }
    if (responseType === 'text') {
      return response.text();
    }
    if (responseType === 'blob') {
      return response.blob();
    }
    if (responseType === 'arrayBuffer') {
      return response.arrayBuffer();
    }

    // Auto-detect from content-type
    if (contentType.includes('application/json')) {
      return response.json();
    }
    if (contentType.includes('text/')) {
      return response.text();
    }

    // Default to text
    return response.text();
  }
}
