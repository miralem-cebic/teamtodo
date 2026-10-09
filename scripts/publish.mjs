// Kopiert den fertigen Build (dist/) in einen Zielordner, z. B. in OneDrive.
// Aufruf: npm run deploy -- "/Pfad/zum/Zielordner"
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Bitte Zielordner angeben: npm run deploy -- "/Pfad/zum/Ordner"');
  process.exit(1);
}
const dist = resolve('dist');
await stat(join(dist, 'index.html')).catch(() => {
  console.error('dist/index.html fehlt – zuerst npm run build ausführen.');
  process.exit(1);
});
await mkdir(target, { recursive: true });
// nur die App-Dateien ersetzen, nichts anderes im Zielordner anfassen
await rm(join(target, 'assets'), { recursive: true, force: true });
await cp(join(dist, 'assets'), join(target, 'assets'), { recursive: true });
await cp(join(dist, 'index.html'), join(target, 'index.html'));
await cp(resolve('README.md'), join(target, 'Anleitung.md')).catch(() => undefined);
console.log(`App nach ${target} kopiert.`);
