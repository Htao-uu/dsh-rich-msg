/**
 * Package dsh-rich-msg for installation.
 *
 * Builds both halves, stages the runtime files, and writes a zip plus its
 * sha256 into dist/. The zip is what a profile can be pointed at (either
 * unzip into node_modules or install with a link: dependency).
 *
 * Usage: node scripts/package.mjs
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const stageRoot = path.join(root, '.package');
const stage = path.join(stageRoot, pkg.name);
const dist = path.join(root, 'dist');
const zipName = pkg.name + '-' + pkg.version + '.zip';
const zipPath = path.join(dist, zipName);

/** Run one child process and fail the package when it fails. */
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(command + ' ' + args.join(' ') + ' failed with ' + result.status);
}

// 1) Build the two halves.
run(process.execPath, [path.join(root, 'scripts', 'build.mjs')]);

// 2) Stage the runtime files.
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const entries = ['package.json', 'cordis.patch.yml', 'lib', 'README.md', 'LICENSE', 'docs'];
for (const entry of entries) {
  const source = path.join(root, entry);
  if (!existsSync(source)) throw new Error('missing runtime file: ' + entry);
  cpSync(source, path.join(stage, entry), { recursive: true });
}

// 3) Zip it.
mkdirSync(dist, { recursive: true });
rmSync(zipPath, { force: true });
// Prefer bsdtar (ships with modern Windows and creates zip via -a); fall back
// to the platform zip tool.
const tarResult = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', stage, '.'], { stdio: 'inherit', shell: false });
if (tarResult.status !== 0) {
  if (process.platform === 'win32') {
    run('powershell', ['-NoProfile', '-Command', "Compress-Archive -Path '" + stage + "\\*' -DestinationPath '" + zipPath + "' -Force"]);
  } else {
    run('zip', ['-r', '-q', zipPath, '.'], stage);
  }
}

// 4) 计算 sha256。
const bytes = readFileSync(zipPath);
const sha = createHash('sha256').update(bytes).digest('hex');
writeFileSync(zipPath + '.sha256', sha + '  ' + zipName + '\n', 'utf8');
rmSync(stageRoot, { recursive: true, force: true });

const size = statSync(zipPath).size;
console.log('');
console.log('packaged ' + zipName);
console.log('  size   ' + size + ' bytes');
console.log('  sha256 ' + sha);
console.log('  path   ' + zipPath);
