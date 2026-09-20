import { config } from '../src/config.js';
import { enrichProducts } from '../src/services/enrichment.js';

const summary = await enrichProducts(config.enrichment.batchSize);
console.table(summary.results);
console.log(`Scanned through product ${summary.nextProductId}; catalog exhausted: ${summary.exhausted}`);
if (summary.results.some((item) => item.status === 'failed')) process.exitCode = 1;
