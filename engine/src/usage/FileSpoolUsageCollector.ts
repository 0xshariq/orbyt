import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UsageCollector, UsageEvent } from '@dev-ecosystem/core';

/**
 * Transport contract for shipping usage batches to an external ingestion endpoint.
 */
export interface UsageBatchTransport {
    sendBatch(events: UsageEvent[]): Promise<void>;
}

export interface HttpUsageBatchTransportOptions {
    endpoint: string;
    apiKey?: string;
    timeoutMs?: number;
}

/**
 * Minimal HTTP transport used by the file spool collector.
 *
 * The collector remains durable even if this transport is down because pending
 * files are retried later.
 */
export class HttpUsageBatchTransport implements UsageBatchTransport {
    private readonly endpoint: string;
    private readonly apiKey?: string;
    private readonly timeoutMs: number;

    constructor(options: HttpUsageBatchTransportOptions) {
        this.endpoint = options.endpoint;
        this.apiKey = options.apiKey;
        this.timeoutMs = options.timeoutMs ?? 10_000;
    }

    async sendBatch(events: UsageEvent[]): Promise<void> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
                },
                body: JSON.stringify({ events }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Billing ingestion failed (${response.status})`);
            }
        } finally {
            clearTimeout(timeout);
        }
    }
}

interface SpoolEnvelope {
    event: UsageEvent;
    retries: number;
    firstSeenAt: number;
    lastError?: string;
}

export interface FileSpoolUsageCollectorOptions {
    baseDir: string;
    batchSize?: number;
    flushIntervalMs?: number;
    maxRetryAttempts?: number;
    transport?: UsageBatchTransport;
}

/**
 * Durable usage collector backed by filesystem spool directories.
 *
 * Storage layout under baseDir:
 * - pending/: unsent envelopes
 * - sent/: successfully delivered envelopes
 * - failed/: envelopes that exceeded retry attempts
 * - events/: append-only raw JSONL archive by day
 *
 * All operations are intentionally non-fatal so billing telemetry never blocks
 * workflow execution.
 */
export class FileSpoolUsageCollector implements UsageCollector {
    readonly contractVersion = '1.0' as const;
    readonly target = 'billing-engine' as const;

    private readonly baseDir: string;
    private readonly pendingDir: string;
    private readonly sentDir: string;
    private readonly failedDir: string;
    private readonly eventsDir: string;
    private readonly batchSize: number;
    private readonly flushIntervalMs: number;
    private readonly maxRetryAttempts: number;
    private readonly transport?: UsageBatchTransport;

    private flushTimer?: ReturnType<typeof setInterval>;
    private isFlushing = false;
    private lastSuccessAt?: number;

    constructor(options: FileSpoolUsageCollectorOptions) {
        this.baseDir = options.baseDir;
        this.pendingDir = join(this.baseDir, 'pending');
        this.sentDir = join(this.baseDir, 'sent');
        this.failedDir = join(this.baseDir, 'failed');
        this.eventsDir = join(this.baseDir, 'events');
        this.batchSize = options.batchSize ?? 200;
        this.flushIntervalMs = options.flushIntervalMs ?? 60_000;
        this.maxRetryAttempts = options.maxRetryAttempts ?? 10;
        this.transport = options.transport;

        this.ensureDirs();

        if (this.transport) {
            // Background flush is best-effort; explicit close() also triggers a flush.
            this.flushTimer = setInterval(() => {
                void this.flush();
            }, this.flushIntervalMs);
            this.flushTimer.unref?.();
        }
    }

    async record(event: UsageEvent): Promise<void> {
        try {
            this.ensureDirs();
            const envelope: SpoolEnvelope = {
                event,
                retries: 0,
                firstSeenAt: Date.now(),
            };

            const pendingFile = join(this.pendingDir, this.fileNameForEvent(event));
            writeFileSync(pendingFile, JSON.stringify(envelope, null, 2), 'utf8');

            // Keep an immutable day-partitioned archive for audits/reconciliation.
            const day = new Date(event.timestamp).toISOString().slice(0, 10);
            const archiveFile = join(this.eventsDir, `${day}.jsonl`);
            appendFileSync(archiveFile, `${JSON.stringify(event)}\n`, 'utf8');
        } catch {
            // Non-fatal by design
        }
    }

    async recordBatch(events: UsageEvent[]): Promise<void> {
        for (const event of events) {
            await this.record(event);
        }
    }

    async flush(): Promise<void> {
        if (!this.transport || this.isFlushing) {
            return;
        }

        this.isFlushing = true;
        try {
            this.ensureDirs();
            const files = readdirSync(this.pendingDir)
                .filter((name) => name.endsWith('.json'))
                .sort();

            for (let i = 0; i < files.length; i += this.batchSize) {
                const chunk = files.slice(i, i + this.batchSize);
                const envelopes = chunk
                    .map((name) => ({
                        name,
                        path: join(this.pendingDir, name),
                    }))
                    .map(({ name, path }) => ({
                        name,
                        path,
                        envelope: this.readEnvelope(path),
                    }))
                    .filter((entry): entry is { name: string; path: string; envelope: SpoolEnvelope } => entry.envelope !== null);

                if (envelopes.length === 0) {
                    continue;
                }

                const events = envelopes.map((entry) => entry.envelope.event);

                try {
                    await this.transport.sendBatch(events);
                    this.lastSuccessAt = Date.now();

                    // Move successfully sent files out of pending atomically.
                    for (const entry of envelopes) {
                        const target = join(this.sentDir, entry.name);
                        renameSync(entry.path, target);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);

                    for (const entry of envelopes) {
                        const retries = entry.envelope.retries + 1;
                        const updated: SpoolEnvelope = {
                            ...entry.envelope,
                            retries,
                            lastError: errorMessage,
                        };

                        if (retries >= this.maxRetryAttempts) {
                            // Preserve terminal failure context for manual replay.
                            const failedPath = join(this.failedDir, `${Date.now()}-${entry.name}`);
                            writeFileSync(failedPath, JSON.stringify(updated, null, 2), 'utf8');
                            unlinkSync(entry.path);
                        } else {
                            writeFileSync(entry.path, JSON.stringify(updated, null, 2), 'utf8');
                        }
                    }

                    break;
                }
            }
        } catch {
            // Non-fatal by design
        } finally {
            this.isFlushing = false;
        }
    }

    async healthCheck(): Promise<{ healthy: boolean; detail?: string; lastSuccessAt?: number }> {
        try {
            this.ensureDirs();
            const pending = readdirSync(this.pendingDir).filter((f) => f.endsWith('.json')).length;
            const failed = readdirSync(this.failedDir).filter((f) => f.endsWith('.json')).length;

            return {
                healthy: true,
                detail: `pending=${pending}, failed=${failed}`,
                lastSuccessAt: this.lastSuccessAt,
            };
        } catch {
            return {
                healthy: false,
                detail: 'Unable to inspect usage spool directories',
                lastSuccessAt: this.lastSuccessAt,
            };
        }
    }

    async close(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        await this.flush();
    }

    private ensureDirs(): void {
        for (const dir of [this.baseDir, this.pendingDir, this.sentDir, this.failedDir, this.eventsDir]) {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        }
    }

    private fileNameForEvent(event: UsageEvent): string {
        // Keep names filesystem-safe and mostly time-ordered.
        const ts = String(event.timestamp);
        const id = event.id.replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${ts}-${id}.json`;
    }

    private readEnvelope(path: string): SpoolEnvelope | null {
        try {
            const raw = readFileSync(path, 'utf8');
            return JSON.parse(raw) as SpoolEnvelope;
        } catch {
            return null;
        }
    }
}
