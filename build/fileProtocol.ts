import type { Plugin } from 'vite';

/**
 * Chrome blockiert unter file:// Modul-Skripte und CORS-Anfragen (Origin "null").
 * Dieses Plugin macht aus dem gebauten index.html ein klassisches Dokument:
 * - <script type="module" crossorigin> → <script defer>
 * - crossorigin an Stylesheets entfernen
 * - modulepreload-Links entfernen
 */
export function fileProtocol(): Plugin {
  return {
    name: 'teamtodo:file-protocol',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) continue;
        let html = String(asset.source);
        html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');
        html = html.replace(/<script\b([^>]*)>/g, (_m, attrs: string) => {
          const cleaned = attrs.replace(/\s+type="module"/, '').replace(/\s+crossorigin(="[^"]*")?/, '');
          return /\bsrc=/.test(cleaned) ? `<script defer${cleaned}>` : `<script${cleaned}>`;
        });
        html = html.replace(/(<link\b[^>]*?)\s+crossorigin(="[^"]*")?/g, '$1');
        if (/type="module"/.test(html)) {
          this.error('index.html enthält noch type="module" – unter file:// würde die App nicht starten.');
        }
        asset.source = html;
      }
    },
  };
}
