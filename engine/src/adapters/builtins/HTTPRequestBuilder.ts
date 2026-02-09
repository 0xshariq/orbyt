/**
 * HTTP Request Builder
 * 
 * Fluent builder for constructing HTTP requests.
 */

export interface HTTPRequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

export class HTTPRequestBuilder {
  private options: Partial<HTTPRequestOptions>;

  constructor() {
    this.options = {
      method: 'GET',
      headers: {},
    };
  }

  /**
   * Set HTTP method
   */
  method(method: string): this {
    this.options.method = method.toUpperCase();
    return this;
  }

  /**
   * Set URL
   */
  url(url: string): this {
    this.options.url = url;
    return this;
  }

  /**
   * Set a header
   */
  header(name: string, value: string): this {
    if (!this.options.headers) {
      this.options.headers = {};
    }
    this.options.headers[name] = value;
    return this;
  }

  /**
   * Set multiple headers
   */
  headers(headers: Record<string, string>): this {
    this.options.headers = { ...this.options.headers, ...headers };
    return this;
  }

  /**
   * Set request body
   */
  body(body: unknown): this {
    this.options.body = body;
    return this;
  }

  /**
   * Set JSON body and Content-Type header
   */
  json(data: unknown): this {
    this.options.body = JSON.stringify(data);
    this.header('Content-Type', 'application/json');
    return this;
  }

  /**
   * Set form data body
   */
  form(data: Record<string, string>): this {
    const params = new URLSearchParams(data);
    this.options.body = params.toString();
    this.header('Content-Type', 'application/x-www-form-urlencoded');
    return this;
  }

  /**
   * Set timeout
   */
  timeout(ms: number): this {
    this.options.timeout = ms;
    return this;
  }

  /**
   * Set retry count
   */
  retries(count: number): this {
    this.options.retries = count;
    return this;
  }

  /**
   * Set abort signal
   */
  signal(signal: AbortSignal): this {
    this.options.signal = signal;
    return this;
  }

  /**
   * Set Bearer token authentication
   */
  bearerAuth(token: string): this {
    this.header('Authorization', `Bearer ${token}`);
    return this;
  }

  /**
   * Set Basic authentication
   */
  basicAuth(username: string, password: string): this {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    this.header('Authorization', `Basic ${credentials}`);
    return this;
  }

  /**
   * Add query parameters
   */
  query(params: Record<string, string | number | boolean>): this {
    if (!this.options.url) {
      throw new Error('URL must be set before adding query parameters');
    }

    const url = new URL(this.options.url);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, String(value));
    }
    this.options.url = url.toString();
    return this;
  }

  /**
   * Build the request options
   */
  build(): HTTPRequestOptions {
    if (!this.options.url) {
      throw new Error('URL is required');
    }

    return this.options as HTTPRequestOptions;
  }

  /**
   * Create a GET request builder
   */
  static get(url: string): HTTPRequestBuilder {
    return new HTTPRequestBuilder().method('GET').url(url);
  }

  /**
   * Create a POST request builder
   */
  static post(url: string): HTTPRequestBuilder {
    return new HTTPRequestBuilder().method('POST').url(url);
  }

  /**
   * Create a PUT request builder
   */
  static put(url: string): HTTPRequestBuilder {
    return new HTTPRequestBuilder().method('PUT').url(url);
  }

  /**
   * Create a PATCH request builder
   */
  static patch(url: string): HTTPRequestBuilder {
    return new HTTPRequestBuilder().method('PATCH').url(url);
  }

  /**
   * Create a DELETE request builder
   */
  static delete(url: string): HTTPRequestBuilder {
    return new HTTPRequestBuilder().method('DELETE').url(url);
  }
}
