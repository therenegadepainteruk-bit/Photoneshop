/**
 * core/benchmark.js — Automatic performance benchmarking
 *
 * Solves CONCERN #5 (Missing automatic benchmarking):
 * - Timer decorator on all major functions
 * - Track pixels/second throughput
 * - Memory peak & GC pauses
 * - Performance regression detection
 * - Exportable telemetry JSON
 */

class Benchmark {
  constructor(name) {
    this.name = name;
    this.startTime = 0;
    this.endTime = 0;
    this.duration = 0;
    this.pixelsProcessed = 0;
    this.throughput = 0; // pixels/sec
    this.memoryPeakMB = 0;
    this.gcPauses = [];
    this.error = null;
  }

  start() {
    this.startTime = performance.now();
    return this;
  }

  end(pixelsProcessed = 0) {
    this.endTime = performance.now();
    this.duration = this.endTime - this.startTime;
    this.pixelsProcessed = pixelsProcessed;

    if (pixelsProcessed > 0 && this.duration > 0) {
      this.throughput = Math.round((pixelsProcessed / this.duration) * 1000); // px/ms -> px/sec
    }

    return this;
  }

  setMemoryPeak(mb) {
    this.memoryPeakMB = mb;
    return this;
  }

  recordGCPause(durationMS) {
    this.gcPauses.push(durationMS);
    return this;
  }

  fail(error) {
    this.error = error?.message || String(error);
    return this;
  }

  toJSON() {
    return {
      name: this.name,
      durationMS: Math.round(this.duration * 100) / 100,
      pixelsProcessed: this.pixelsProcessed,
      throughputPixelsPerSec: this.throughput,
      memoryPeakMB: Math.round(this.memoryPeakMB * 100) / 100,
      gcPausesMS: this.gcPauses.map(p => Math.round(p * 100) / 100),
      gcPauseCount: this.gcPauses.length,
      gcPauseAvgMS: this.gcPauses.length > 0
        ? Math.round((this.gcPauses.reduce((a, b) => a + b, 0) / this.gcPauses.length) * 100) / 100
        : 0,
      error: this.error || null,
      timestamp: new Date().toISOString(),
    };
  }
}

const benchmarks = [];
let isRecording = false;

/**
 * Start recording benchmarks.
 */
function startRecording() {
  isRecording = true;
  benchmarks.length = 0;
  return { started: true };
}

/**
 * Stop recording benchmarks.
 */
function stopRecording() {
  isRecording = false;
  return { stopped: true, count: benchmarks.length };
}

/**
 * Decorator: wrap a function to benchmark it.
 *
 * @param {Function} fn — function to benchmark
 * @param {string} name — benchmark name
 * @returns {Function} wrapped function
 */
function benchmarkFn(fn, name) {
  return async function benchmarked(...args) {
    if (!isRecording) {
      return fn.apply(this, args);
    }

    const bench = new Benchmark(name || fn.name || 'unknown');
    bench.start();

    try {
      const result = await fn.apply(this, args);

      // Estimate pixels processed (for image operations)
      if (result && result.pixelsProcessed) {
        bench.end(result.pixelsProcessed);
      } else if (result && result.w && result.h) {
        bench.end(result.w * result.h);
      } else {
        bench.end(0);
      }

      // Get memory peak if available
      if (typeof window !== 'undefined' && window.PhotoneshopMemory) {
        const stats = window.PhotoneshopMemory.getMemoryStats();
        bench.setMemoryPeak(stats.peakMemoryMB);
      }

      benchmarks.push(bench);
      return result;
    } catch (e) {
      bench.fail(e);
      benchmarks.push(bench);
      throw e;
    }
  };
}

/**
 * Get all recorded benchmarks as JSON.
 */
function exportBenchmarks() {
  return {
    recordedAt: new Date().toISOString(),
    count: benchmarks.length,
    benchmarks: benchmarks.map(b => b.toJSON()),
    summary: {
      totalDurationMS: benchmarks.reduce((sum, b) => sum + b.duration, 0),
      totalPixelsProcessed: benchmarks.reduce((sum, b) => sum + b.pixelsProcessed, 0),
      avgThroughput: Math.round(
        benchmarks.filter(b => b.throughput > 0).reduce((sum, b) => sum + b.throughput, 0) /
        Math.max(1, benchmarks.filter(b => b.throughput > 0).length),
      ),
      peakMemoryMB: Math.max(...benchmarks.map(b => b.memoryPeakMB), 0),
      errorCount: benchmarks.filter(b => b.error).length,
    },
  };
}

/**
 * Compare two benchmark exports to detect regressions.
 *
 * Returns array of regressions found.
 */
function detectRegressions(baseline, current, thresholdPercent = 10) {
  const regressions = [];

  const baselineByName = {};
  for (const bench of baseline.benchmarks) {
    baselineByName[bench.name] = bench;
  }

  for (const bench of current.benchmarks) {
    const base = baselineByName[bench.name];
    if (!base) continue;

    const durationDelta = ((bench.durationMS - base.durationMS) / base.durationMS) * 100;
    if (durationDelta > thresholdPercent) {
      regressions.push({
        operation: bench.name,
        baseDurationMS: base.durationMS,
        currentDurationMS: bench.durationMS,
        regressionPercent: Math.round(durationDelta),
        severity: durationDelta > 50 ? 'HIGH' : 'MEDIUM',
      });
    }

    const memoryDelta = ((bench.memoryPeakMB - base.memoryPeakMB) / base.memoryPeakMB) * 100;
    if (memoryDelta > thresholdPercent) {
      regressions.push({
        operation: `${bench.name} (memory)`,
        baseMemoryMB: base.memoryPeakMB,
        currentMemoryMB: bench.memoryPeakMB,
        regressionPercent: Math.round(memoryDelta),
        severity: memoryDelta > 50 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  return regressions;
}

/**
 * Format benchmarks for user display.
 */
function formatBenchmarks(benchmarks) {
  const rows = benchmarks.map(b => {
    const ms = Math.round(b.durationMS * 10) / 10;
    const throughput = b.throughput || 0;
    const memory = Math.round(b.memoryPeakMB * 10) / 10;
    return `${b.name}: ${ms}ms, ${throughput} px/s, ${memory}MB`;
  });
  return rows.join('\n');
}

// Export
if (typeof window !== 'undefined') {
  window.PhotoneshopBenchmark = {
    Benchmark,
    startRecording,
    stopRecording,
    benchmarkFn,
    exportBenchmarks,
    detectRegressions,
    formatBenchmarks,
  };
}
