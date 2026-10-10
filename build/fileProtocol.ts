import type { Plugin } from 'vite';

/**
 * Chrome blocks module scripts and CORS requests under file:// (origin "null").
 * This plugin turns the built index.html into a classic document:
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
          this.error('index.html still contains type="module" – under file:// the app would not start.');
        }
        asset.source = html;
      }
    },
  };
}
