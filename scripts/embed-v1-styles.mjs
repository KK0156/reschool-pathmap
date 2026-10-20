import {readFile, writeFile} from 'node:fs/promises';

// Retain the original design verbatim. The archive can render it even when an
// external stylesheet is stale, unavailable, or blocked. The CSS files remain
// the source of truth; the build refuses to publish an out-of-sync copy.
const pageURL = new URL('../original.html', import.meta.url);
const original = await readFile(pageURL, 'utf8');
let embedded = original;
for (const [id, path] of [
  ['reschool-v1-styles', '../assets/index-dibtv9up.css'],
  ['reschool-v1-archive-styles', '../src/original.css']
]) {
  const css = await readFile(new URL(path, import.meta.url), 'utf8');
  if (/<\/style\b/i.test(css) || /@import\b/i.test(css)) {
    throw new Error(`Archive styles must be self-contained and safe to embed: ${path}`);
  }
  const start = `<!-- ${id}:start -->`;
  const end = `<!-- ${id}:end -->`;
  if (embedded.split(start).length !== 2 || embedded.split(end).length !== 2) {
    throw new Error(`Expected one archive style marker pair: ${id}`);
  }
  const before = embedded.indexOf(start) + start.length;
  const after = embedded.indexOf(end);
  if (after < before) throw new Error(`Invalid archive style marker order: ${id}`);
  embedded = embedded.slice(0, before) + `\n  <style id="${id}">\n${css.trimEnd()}\n  </style>\n  ` + embedded.slice(after);
}
if (embedded !== original) {
  if (process.argv.includes('--check')) {
    console.error('RE:School v1 styles are out of sync. Run: npm run archive:styles');
    process.exitCode = 1;
  } else {
    await writeFile(pageURL, embedded);
    console.log('Embedded the retained RE:School v1 styles in original.html.');
  }
}
