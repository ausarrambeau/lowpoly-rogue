// Strips the document shell from the single-file Vite build so it can be published as an Artifact
// (the host wraps the fragment in its own <html>/<head>/<body>).
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-single/index.html', 'utf8');
const title = /<title>(.*?)<\/title>/s.exec(src)?.[1] ?? 'Low Poly Rogue';
const styles = [...src.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...src.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const body = (/<body[^>]*>([\s\S]*?)<\/body>/.exec(src)?.[1] ?? '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim();
const out = `<title>${title}</title>\n${styles.join('\n')}\n${body}\n${scripts.join('\n')}\n`;
writeFileSync('dist-single/artifact.html', out);
console.log(`wrote dist-single/artifact.html (${(out.length / 1024).toFixed(0)} KB)`);
