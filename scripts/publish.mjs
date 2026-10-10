// Copies the finished build (dist/) into a target folder, e.g. OneDrive.
// Usage: npm run deploy -- "/path/to/target"
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Please specify a target folder: npm run deploy -- "/path/to/folder"');
  process.exit(1);
}
const dist = resolve('dist');
await stat(join(dist, 'index.html')).catch(() => {
  console.error('dist/index.html is missing – run npm run build first.');
  process.exit(1);
});
await mkdir(target, { recursive: true });
// only replace the app files, leave everything else in the target folder alone
await rm(join(target, 'assets'), { recursive: true, force: true });
await cp(join(dist, 'assets'), join(target, 'assets'), { recursive: true });
await cp(join(dist, 'index.html'), join(target, 'index.html'));
await cp(resolve('docs/user-guide.md'), join(target, 'user-guide.md')).catch(() => undefined);
console.log(`App copied to ${target}.`);
