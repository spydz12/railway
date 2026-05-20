import * as fs from 'fs';
import * as path from 'path';

interface IntelligenceRecord {
  timestamp: string;
  service: string;
  symbol: string | null;
  strategy: string | null;
  stage: string;
  severity: 'warn' | 'error' | 'critical' | 'info';
  error: string | null;
  stack: string | null;
  payload: Record<string, unknown>;
}

function getTargetDate(): string {
  const arg = process.argv[2];
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  return new Date().toISOString().slice(0, 10);
}

function readJsonl(filePath: string): IntelligenceRecord[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const out: IntelligenceRecord[] = [];

  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as IntelligenceRecord);
    } catch {
      // Ignore malformed lines.
    }
  }

  return out;
}

function topN(map: Map<string, number>, n = 10): Array<{ key: string; count: number }> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toHealthScore(totalWarn: number, totalError: number, totalCritical: number): number {
  const penalty = totalWarn * 1 + totalError * 3 + totalCritical * 8;
  return Math.max(0, Math.min(100, 100 - penalty));
}

function printTop(title: string, rows: Array<{ key: string; count: number }>): void {
  console.log(`\n${title}`);
  if (rows.length === 0) {
    console.log('- none');
    return;
  }
  for (const row of rows) {
    console.log(`- ${row.key}: ${row.count}`);
  }
}

function main(): void {
  const date = getTargetDate();
  const logsDir = path.join(process.cwd(), 'logs');

  const warningsFile = path.join(logsDir, `warnings-${date}.jsonl`);
  const errorsFile = path.join(logsDir, `errors-${date}.jsonl`);
  const criticalFile = path.join(logsDir, `critical-${date}.jsonl`);

  const warnings = readJsonl(warningsFile);
  const errors = readJsonl(errorsFile);
  const critical = readJsonl(criticalFile);

  const all = [...warnings, ...errors, ...critical];

  const byError = new Map<string, number>();
  const bySymbol = new Map<string, number>();
  const byStrategy = new Map<string, number>();
  const byStage = new Map<string, number>();
  const aiSummary = {
    total: 0,
    errors: 0,
    warnings: 0,
    critical: 0,
  };

  for (const row of all) {
    bump(byError, row.error || 'unknown_error');
    if (row.symbol) bump(bySymbol, row.symbol);
    if (row.strategy) bump(byStrategy, row.strategy);
    bump(byStage, row.stage || 'unknown_stage');

    const isAI = (row.stage || '').toLowerCase().includes('ai') ||
      JSON.stringify(row.payload || {}).toLowerCase().includes('ai');
    if (isAI) {
      aiSummary.total += 1;
      if (row.severity === 'warn') aiSummary.warnings += 1;
      if (row.severity === 'error') aiSummary.errors += 1;
      if (row.severity === 'critical') aiSummary.critical += 1;
    }
  }

  const healthScore = toHealthScore(warnings.length, errors.length, critical.length);

  console.log(`Log Analysis Date: ${date}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Critical: ${critical.length}`);
  console.log(`Daily Health Score: ${healthScore}/100`);

  printTop('Top Errors', topN(byError, 10));
  printTop('Frequency By Stage', topN(byStage, 10));
  printTop('Failing Symbols', topN(bySymbol, 10));
  printTop('Failing Strategies', topN(byStrategy, 10));

  console.log('\nAI Summary');
  console.log(`- Total AI-related events: ${aiSummary.total}`);
  console.log(`- Warnings: ${aiSummary.warnings}`);
  console.log(`- Errors: ${aiSummary.errors}`);
  console.log(`- Critical: ${aiSummary.critical}`);
}

main();
