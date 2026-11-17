// Token launch radar: the entrypoint.
//
// Reads the sealed DefiLlama snapshot, scores every protocol with the radar-2
// model in lib/model.ts, and writes the ranked board, the dashboard data, the
// dashboard and its screenshots, and the judge's dossier into the output
// directory.
//
//   node main.ts [--input <snapshot.json|directory>]
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
//
// Defaults: input /input/snapshot.json, output /output. Standard library only,
// no network, no wall-clock time, no randomness: two runs on the same snapshot
// write byte-identical output.

import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** Where the snapshot lives when no --input is given. */
const DEFAULT_INPUT = '/input/snapshot.json';

/** Where the outputs go when MAKEFUN_OUTPUT_DIR is not set. */
const DEFAULT_OUTPUT = '/output';

/** The dossier text cap the gate grades against. */
const DOSSIER_TEXT_MAX_BYTES = 65536;

/** The snapshot path from --input, or the default. */
function inputPath(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--input' && i + 1 < argv.length) return argv[i + 1]!;
    if (arg.startsWith('--input=')) return arg.slice('--input='.length);
  }
  return DEFAULT_INPUT;
}

/** A directory names its snapshot.json; a file names itself. */
function snapshotFile(path: string): string {
  if (existsSync(path) && statSync(path).isDirectory()) return join(path, 'snapshot.json');
  return path;
}

/** Copy a directory whole, creating the destination as needed. */
function copyDir(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function main(): void {
  const argv = process.argv.slice(2);
  const input = snapshotFile(inputPath(argv));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT;
  const here = dirname(fileURLToPath(import.meta.url));

  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`board rejected: ${issue}`);

  mkdirSync(outDir, { recursive: true });
  copyDir(join(here, 'dashboard'), join(outDir, 'dashboard'));
  copyDir(join(here, 'screenshots'), join(outDir, 'screenshots'));

  writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows: board }) + '\n', 'utf8');
  writeFileSync(join(outDir, 'data.js'), dataScript(radar), 'utf8');
  writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES }));

  console.log(`token-launch-radar: ${board.length} rows, ${radar.live_size} live, ${radar.watchlist_size} watchlist -> ${outDir}`);
}

main();
