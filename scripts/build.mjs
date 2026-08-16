import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'dist');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const result = await build({
  absWorkingDir: projectRoot,
  entryPoints: {
    app: 'js/app.js',
    styles: 'css/app.css',
  },
  outdir: 'dist/assets',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2022'],
  entryNames: '[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'media/[name]-[hash]',
  metafile: true,
  minify: true,
  sourcemap: true,
  logLevel: 'info',
});

const emittedEntry = (entryPoint) => {
  const output = Object.entries(result.metafile.outputs)
    .find(([, metadata]) => metadata.entryPoint?.replaceAll('\\', '/') === entryPoint);
  if (!output) throw new Error(`Build did not emit ${entryPoint}.`);
  return `./${path.relative(outputDir, path.resolve(projectRoot, output[0])).replaceAll('\\', '/')}`;
};

const scriptPath = emittedEntry('js/app.js');
const stylePath = emittedEntry('css/app.css');

await Promise.all([
  cp(path.join(projectRoot, 'assets'), path.join(outputDir, 'assets'), { recursive: true }),
  cp(path.join(projectRoot, 'data'), path.join(outputDir, 'data'), { recursive: true }),
  cp(path.join(projectRoot, 'manifest.webmanifest'), path.join(outputDir, 'manifest.webmanifest')),
]);

// The source stays directly runnable; production HTML points only at hashed bundles.
let html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
html = html.replace(/\s*<link rel="stylesheet" href="css\/[^\"]+">/g, '');
html = html.replace('  </head>', `    <link rel="stylesheet" href="${stylePath}">\n  </head>`);
html = html.replace(
  /<script type="module" src="js\/app\.js"><\/script>/,
  `<script type="module" src="${scriptPath}"></script>`,
);
await writeFile(path.join(outputDir, 'index.html'), html);

const listFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  }));
  return nested.flat();
};

const outputFiles = (await listFiles(outputDir))
  .filter((file) => !file.endsWith('.map'))
  .sort();
const precache = ['./', ...outputFiles.map((file) => `./${path.relative(outputDir, file).replaceAll('\\', '/')}`)];
const buildHash = createHash('sha256');
for (const file of outputFiles) buildHash.update(await readFile(file));

let serviceWorker = await readFile(path.join(projectRoot, 'sw.js'), 'utf8');
serviceWorker = serviceWorker.replace('__BUILD_HASH__', buildHash.digest('hex').slice(0, 12));
serviceWorker = serviceWorker.replace('/* __PRECACHE_MANIFEST__ */ []', JSON.stringify(precache, null, 2));
await writeFile(path.join(outputDir, 'sw.js'), serviceWorker);

console.log(`Atlas production build created with ${precache.length} precached URLs.`);
