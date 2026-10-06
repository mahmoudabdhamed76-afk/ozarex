import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLargeDataset } from './gen-large-dataset.mjs';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'large-dataset.json.gz');
/* the committed fixture; falls back to generating it (same seed → same data) */
export function loadLargeDataset() {
  if (existsSync(FILE)) return JSON.parse(gunzipSync(readFileSync(FILE)).toString('utf8'));
  return buildLargeDataset();
}
