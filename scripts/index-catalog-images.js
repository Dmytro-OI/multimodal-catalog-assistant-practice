import { config } from '../src/config.js';
import { indexImages } from '../src/services/imageIndex.js';

let exhausted = false;
let total = 0;
let hasFailures = false;

while (!exhausted) {
  const summary = await indexImages(config.indexing.batchSize);
  console.table(summary.results);
  total += summary.results.length;
  exhausted = summary.exhausted;
  hasFailures ||= summary.results.some((item) => item.status === 'failed');
  console.log(`Processed this pass: ${summary.results.length}; total: ${total}; catalog exhausted: ${exhausted}`);
  if (!summary.results.length) break;
}

if (hasFailures) process.exitCode = 1;
