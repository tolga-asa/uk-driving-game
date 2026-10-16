// Builds the single-file game from src/.
//   node build.mjs            → index.html (standalone: double-click to play, works offline)
//   node build.mjs <outFile>  → also writes <outFile> without the document skeleton (for hosts that add their own)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = f => readFileSync(join(here, 'src', f), 'utf8');
const scripts = ['questions.js', 'questions2.js', 'questions3.js', 'core.js', 'map.js', 'scenery.js', 'traffic.js', 'traffic2.js', 'player.js', 'rules.js', 'render.js', 'render2.js', 'ui.js', 'main.js']
  .map(src).join('\n') + '\nboot();\n';
const page = src('game.html')
  .replace('/*STYLES*/', () => src('styles.css'))
  .replace('/*SCRIPTS*/', () => scripts.replace(/<\/script/gi, '<\\/script'));

const [head, body] = page.split('<!--BODY-->');
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}</head>
<body>
${body}</body>
</html>
`;
writeFileSync(join(here, 'index.html'), standalone);
console.log('wrote index.html', (standalone.length / 1024).toFixed(0) + ' kB');

const out = process.argv[2];
if (out) { writeFileSync(out, page.replace('<!--BODY-->', '')); console.log('wrote', out); }
