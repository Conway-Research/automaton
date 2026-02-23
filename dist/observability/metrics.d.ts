/**
 * Metrics Collector
 *
 * In-process metrics collection with counters, gauges, and histograms.
 * Uses Map with JSON-serialized labels as composite keys.
 * Never throws — silently drops on error.
 */
import type { MetricEntry, MetricSnapshot } from "../types.js";
export declare class MetricsCollector {
    private counters;
    private gauges;
    private histogramValues;
    private labelStore;
    private nameStore;
    increment(name: string, labels?: Record<string, string>, delta?: number): void;
    gauge(name: string, value: number, labels?: Record<string, string>): void;
    histogram(name: string, value: number, labels?: Record<string, string>): void;
    getCounter(name: string, labels?: Record<string, string>): number;
    getGauge(name: string, labels?: Record<string, string>): number;
    getHistogram(name: string, labels?: Record<string, string>): number[];
    getAll(): MetricEntry[];
    getSnapshot(): MetricSnapshot;
    reset(): void;
}
export declare function getMetrics(): MetricsCollector;
//# sourceMappingURL=metrics.d.ts.map