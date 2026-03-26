#!/usr/bin/env node
/**
 * md2pdf.mjs — Convert Markdown to PDF with Tyndall blog styles
 * Copyright (c) 2026 Moyuin. Licensed under GPL-3.0.
 *
 * Usage:
 *   node tools/md2pdf.mjs <input.md> [output.pdf]
 *   pnpm pdf <input.md> [output.pdf]
 *
 * Optional flags:
 *   --dark          Use dark mode theme
 *   --lang=en       Set document language (en/zh, default: zh)
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of args) {
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    flags[k] = v ?? true;
  } else {
    positional.push(a);
  }
}

const inputPath = positional[0];
if (!inputPath) {
  console.error('Usage: node tools/md2pdf.mjs <input.md> [output.pdf] [--dark] [--lang=en]');
  process.exit(1);
}

const absInput = resolve(process.cwd(), inputPath);
if (!existsSync(absInput)) {
  console.error(`File not found: ${absInput}`);
  process.exit(1);
}

const outputPath = positional[1] ?? absInput.replace(/\.md$/i, '.pdf');
const isDark = !!flags.dark;
const lang = flags.lang ?? 'zh';

// ─── Import dependencies ───────────────────────────────────────────────────────
let puppeteer, matter, marked, hljs;

try {
  ({ default: puppeteer } = await import('puppeteer'));
} catch {
  console.error('Missing dependency: puppeteer\n  Run: pnpm add -D puppeteer');
  process.exit(1);
}

try {
  ({ default: matter } = await import('gray-matter'));
} catch {
  console.error('Missing dependency: gray-matter\n  Run: pnpm add -D gray-matter');
  process.exit(1);
}

try {
  ({ marked } = await import('marked'));
} catch {
  console.error('Missing dependency: marked\n  Run: pnpm add marked');
  process.exit(1);
}

try {
  ({ default: hljs } = await import('highlight.js'));
} catch {
  console.error('Missing dependency: highlight.js\n  Run: pnpm add -D highlight.js');
  process.exit(1);
}

// ─── Parse markdown ────────────────────────────────────────────────────────────
const raw = readFileSync(absInput, 'utf-8');
const { data: frontmatter, content: mdContent } = matter(raw);

const title = frontmatter.title ?? basename(inputPath, extname(inputPath));

// ─── Configure marked ──────────────────────────────────────────────────────────
const renderer = new marked.Renderer();

// Code blocks: Mermaid → special div; others → Apple-style + highlight.js
renderer.code = ({ text, lang: codeLang }) => {
  // Mermaid diagrams: output raw definition for mermaid.js to render
  if (codeLang === 'mermaid') {
    return `<div class="mermaid">${text}</div>`;
  }

  const language = codeLang || 'plaintext';
  let highlighted;
  try {
    highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  } catch {
    highlighted = hljs.highlightAuto(text).value;
  }
  const label = language === 'plaintext' ? '' : language;
  return `
<div class="code-block-wrapper">
  <div class="code-block-header">
    <span class="traffic-lights"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></span>
    <span class="code-block-language">${label}</span>
  </div>
  <pre><code class="hljs language-${language}">${highlighted}</code></pre>
</div>`;
};

// Tables with wrapper for overflow
renderer.table = (token) => {
  const header = token.header.map((cell, i) => {
    const align = token.align[i];
    const alignAttr = align ? ` align="${align}"` : '';
    return `<th${alignAttr}>${cell.tokens ? marked.parseInline(cell.tokens.map(t => t.raw ?? '').join('')) : cell.text}</th>`;
  }).join('');

  const rows = token.rows.map(row => {
    const cells = row.map((cell, i) => {
      const align = token.align[i];
      const alignAttr = align ? ` align="${align}"` : '';
      return `<td${alignAttr}>${cell.tokens ? marked.parseInline(cell.tokens.map(t => t.raw ?? '').join('')) : cell.text}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<div class="table-wrapper"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
};

// Images with caption from alt text
renderer.image = ({ href, title: imgTitle, text: alt }) => {
  const caption = alt || imgTitle;
  const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : '';
  return `<figure class="image-figure"><img src="${href}" alt="${alt ?? ''}" />${captionHtml}</figure>`;
};

marked.use({ renderer });

// ─── Convert markdown ──────────────────────────────────────────────────────────
const bodyHtml = marked.parse(mdContent);

// ─── Detect if content has mermaid blocks ──────────────────────────────────────
const hasMermaid = /```mermaid/i.test(mdContent);

// ─── Styles ───────────────────────────────────────────────────────────────────
const lightVars = `
  --purple: #a259ec;
  --bg: #fff;
  --text: #222;
  --grey: #888;
  --font-serif: "Noto Serif SC", "Noto Serif", Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, "SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
`;

const darkVars = `
  --purple: #a259ec;
  --bg: #070615;
  --text: #f7f7fc;
  --grey: #a6a6c1;
  --font-serif: "Noto Serif SC", "Noto Serif", Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, "SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
`;

const css = `
/* ── Base ── */
:root { ${isDark ? darkVars : lightVars} }

*, *::before, *::after { box-sizing: border-box; }

@media print {
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}

html, body {
  margin: 0; padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 300;
}

.page-wrapper {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 40px;
}

/* ── Post title ── */
.post-title {
  font-family: var(--font-serif);
  font-size: 2.2em;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text);
  margin: 0 0 1.5em;
}

/* ── Markdown content ── */
.markdown-content {
  font-family: var(--font-serif);
  line-height: 1.8;
  font-size: 1.0rem;
  color: var(--text);
}

.markdown-content h1, .markdown-content h2,
.markdown-content h3, .markdown-content h4,
.markdown-content h5, .markdown-content h6 {
  font-family: var(--font-serif);
  font-weight: 700;
  margin-top: 2em;
  margin-bottom: 1em;
  line-height: 1.3;
  color: var(--text);
  page-break-after: avoid;
}

.markdown-content h1 { font-size: 2.5em; }
.markdown-content h2 {
  font-size: 2em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid rgba(162, 89, 236, 0.2);
}
.markdown-content h3 { font-size: 1.5em; }
.markdown-content h4 { font-size: 1.2em; }
.markdown-content h5 { font-size: 1.1em; }
.markdown-content h6 { font-size: 1em; }

.markdown-content p { margin-bottom: 1em; }

.markdown-content a {
  color: var(--purple);
  text-decoration: none;
}

.markdown-content ul, .markdown-content ol {
  margin-bottom: 1em;
  padding-left: 1.5em;
}

.markdown-content li { margin-bottom: 0.5em; }

.markdown-content ul ul, .markdown-content ul ol,
.markdown-content ol ul, .markdown-content ol ol {
  margin-top: 0.5em; margin-bottom: 0.5em;
}

.markdown-content blockquote {
  border-left: 4px solid var(--purple);
  padding-left: 1em;
  margin: 1.5em 0;
  color: var(--grey);
  font-style: italic;
  word-break: break-word;
}

.markdown-content blockquote p:last-child { margin-bottom: 0; }

/* ── Code blocks (Apple style) ── */
.markdown-content .code-block-wrapper {
  position: relative;
  margin-bottom: 1em;
  border-radius: 10px;
  overflow: hidden;
  background-color: ${isDark ? 'rgba(30, 30, 30, 0.95)' : '#f5f5f7'};
  border: 1px solid ${isDark ? 'rgba(162, 89, 236, 0.3)' : 'rgba(0, 0, 0, 0.08)'};
  box-shadow: ${isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.08)'};
  page-break-inside: avoid;
}

.markdown-content .code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 14px;
  min-height: 32px;
  position: relative;
  ${isDark
    ? 'background: transparent; border-bottom: 1px solid rgba(162, 89, 236, 0.3);'
    : 'background: linear-gradient(180deg, #e8e8ed 0%, #dcdce2 100%); border-bottom: 1px solid rgba(0,0,0,0.06);'}
}

/* Traffic lights */
.markdown-content .traffic-lights {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.markdown-content .traffic-lights .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.markdown-content .traffic-lights .dot.red    { background-color: #ff5f57; }
.markdown-content .traffic-lights .dot.yellow { background-color: #febc2e; }
.markdown-content .traffic-lights .dot.green  { background-color: #28c840; }

.markdown-content .code-block-language {
  font-family: var(--font-mono);
  font-size: 0.8em;
  color: ${isDark ? 'rgba(162, 89, 236, 0.8)' : 'rgba(0,0,0,0.45)'};
  font-weight: 500;
  letter-spacing: 0.3px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.markdown-content pre {
  background: transparent !important;
  padding: 1em 1.2em;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.88em;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre;
}

.markdown-content pre code {
  background: transparent;
  padding: 0;
  font-size: inherit;
  color: inherit;
  border-radius: 0;
  white-space: inherit;
}

/* ── highlight.js theme (github-like) ── */
${isDark ? `
.hljs { color: #c9d1d9; }
.hljs-keyword, .hljs-selector-tag { color: #ff7b72; font-weight: bold; }
.hljs-string, .hljs-attr { color: #a5d6ff; }
.hljs-number, .hljs-literal { color: #79c0ff; }
.hljs-comment, .hljs-quote { color: #8b949e; font-style: italic; }
.hljs-built_in, .hljs-type { color: #ffa657; }
.hljs-function, .hljs-title { color: #d2a8ff; font-weight: bold; }
.hljs-variable, .hljs-name { color: #c9d1d9; }
.hljs-tag { color: #7ee787; }
.hljs-attribute { color: #79c0ff; }
.hljs-meta { color: #8b949e; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: bold; }
` : `
.hljs { color: #24292e; }
.hljs-keyword, .hljs-selector-tag { color: #d73a49; font-weight: bold; }
.hljs-string, .hljs-attr { color: #032f62; }
.hljs-number, .hljs-literal { color: #005cc5; }
.hljs-comment, .hljs-quote { color: #6a737d; font-style: italic; }
.hljs-built_in, .hljs-type { color: #e36209; }
.hljs-function, .hljs-title { color: #6f42c1; font-weight: bold; }
.hljs-variable, .hljs-name { color: #24292e; }
.hljs-tag { color: #22863a; }
.hljs-attribute { color: #005cc5; }
.hljs-meta { color: #6a737d; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: bold; }
`}

/* ── Inline code ── */
.markdown-content :not(pre) > code {
  font-family: var(--font-mono);
  background-color: ${isDark ? 'rgba(162, 89, 236, 0.15)' : 'rgba(0,0,0,0.06)'};
  color: ${isDark ? '#e8e6f0' : '#1d1d1f'};
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.88em;
  word-break: break-word;
  white-space: pre-wrap;
}

/* ── Tables ── */
.markdown-content .table-wrapper {
  width: 100%;
  overflow-x: auto;
  margin-bottom: 1em;
}

.markdown-content table {
  width: 100%;
  border-collapse: collapse;
  display: table;
  table-layout: auto;
}

.markdown-content th, .markdown-content td {
  border: 1px solid ${isDark ? '#555' : 'var(--grey)'};
  padding: 0.8em;
  text-align: left;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.markdown-content th {
  background-color: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(128,128,128,0.1)'};
  font-weight: 400;
}

/* ── Images ── */
.markdown-content img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
  border-radius: 5px;
}

.markdown-content figure.image-figure {
  margin: 1.2em auto;
  text-align: center;
}

.markdown-content figure.image-figure img { margin: 0 auto; }

.markdown-content figure.image-figure figcaption {
  margin-top: 0.5em;
  font-size: 0.9em;
  color: var(--grey);
}

/* ── HR ── */
.markdown-content hr {
  border: none;
  border-top: 1px solid var(--grey);
  margin: 2em 0;
}

/* ── Text decoration ── */
.markdown-content strong, .markdown-content b {
  font-weight: 500;
  color: var(--text);
}

.markdown-content em, .markdown-content i { font-style: italic; }

.markdown-content u {
  text-decoration: underline;
  text-decoration-color: var(--purple);
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}

.markdown-content mark {
  background-color: rgba(255, 235, 59, ${isDark ? '0.3' : '0.5'});
  padding: 0.1em 0.3em;
  border-radius: 3px;
  color: inherit;
}

.markdown-content del, .markdown-content s {
  text-decoration: line-through;
  opacity: 0.7;
}

.markdown-content ins {
  text-decoration: underline;
  text-decoration-color: #4caf50;
  text-decoration-thickness: 2px;
  background-color: rgba(76, 175, 80, 0.1);
}

.markdown-content sup {
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
}

.markdown-content sub {
  font-size: 0.75em;
  vertical-align: sub;
  line-height: 0;
}

/* ── Kbd ── */
.markdown-content kbd {
  display: inline-block;
  padding: 0.2em 0.5em;
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--text);
  background-color: ${isDark ? '#2d2d2d' : '#f4f4f4'};
  border: 1px solid ${isDark ? '#555' : '#ccc'};
  border-radius: 4px;
  box-shadow: ${isDark
    ? '0 2px 0 rgba(0,0,0,0.4)'
    : '0 2px 0 rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.7) inset'};
  white-space: nowrap;
  vertical-align: middle;
  line-height: 1.4;
}

/* ── Details ── */
.markdown-content details {
  margin-bottom: 1em;
  padding: 1em;
  border: 1px solid var(--grey);
  border-radius: 5px;
  background-color: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(128,128,128,0.05)'};
}

.markdown-content summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 0.5em;
  color: var(--purple);
}

/* ── Task lists ── */
.markdown-content ul.contains-task-list {
  list-style: none;
  padding-left: 1.5em;
}

.markdown-content input[type="checkbox"] {
  margin-right: 0.5em;
  width: 1.1em;
  height: 1.1em;
  vertical-align: middle;
  accent-color: #4caf50;
}

/* ── Footnotes ── */
.markdown-content .footnotes {
  margin-top: 3em;
  padding-top: 1em;
  border-top: 1px solid var(--grey);
  font-size: 0.9em;
}

.markdown-content .footnote-ref {
  text-decoration: none;
  font-size: 0.8em;
  vertical-align: super;
  color: var(--purple);
}

/* ── KaTeX ── */
.markdown-content .katex { font-size: 1.05em; }
.markdown-content .katex-display {
  margin: 1.5em 0;
  overflow-x: auto;
}
${isDark ? '.markdown-content .katex { color: #d4d4d4; }' : ''}

/* ── Mermaid ── */
.markdown-content .mermaid {
  text-align: center;
  margin: 1em auto;
  max-width: 100%;
  page-break-inside: avoid;
  overflow: visible;
}

.markdown-content .mermaid svg {
  max-width: 100%;
  display: block;
  margin: 0 auto;
}

/* ── Definition lists ── */
.markdown-content dl { margin-bottom: 1.5em; }
.markdown-content dt {
  font-weight: 700;
  margin-top: 1em;
  color: var(--text);
}
.markdown-content dd {
  margin-left: 2em;
  margin-bottom: 0.5em;
  color: var(--grey);
}

/* ── Print / PDF tweaks ── */
@page {
  margin: 48px 0 80px 0;
  background: ${isDark ? '#070615' : '#fff'};
}

.markdown-content h1, .markdown-content h2,
.markdown-content h3, .markdown-content h4 {
  page-break-after: avoid;
}

.markdown-content p, .markdown-content li {
  orphans: 3; widows: 3;
}

.markdown-content pre, .markdown-content .code-block-wrapper,
.markdown-content table, .markdown-content figure {
  page-break-inside: avoid;
}
`;

// ─── Mermaid config ────────────────────────────────────────────────────────────
const mermaidTheme = isDark ? 'dark' : 'default';
const mermaidScript = hasMermaid ? `
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: '${mermaidTheme}',
      securityLevel: 'loose',
      fontFamily: '"Noto Serif SC", "Noto Serif", Georgia, serif',
    });
    // A4 = 1123px at 96dpi; subtract top(48px) + bottom(80px) margins
    // Leave 60px breathing room for surrounding heading/text
    const PAGE_CONTENT_H = 1123 - 48 - 80 - 60;  // ~935px

    function fitDiagramsToPage() {
      document.querySelectorAll('.mermaid').forEach(wrapper => {
        const svg = wrapper.querySelector('svg');
        if (!svg) return;

        const naturalH = svg.getBoundingClientRect().height;
        if (naturalH <= PAGE_CONTENT_H) return; // fits fine, leave it

        // Scale down just enough to fit one page
        const scale = PAGE_CONTENT_H / naturalH;
        svg.style.transform = 'scale(' + scale + ')';
        svg.style.transformOrigin = 'top center';
        // Collapse wrapper to scaled height — no leftover gap
        wrapper.style.height = Math.ceil(naturalH * scale) + 'px';
        wrapper.style.overflow = 'hidden';
      });
    }

    // Signal rendering is done
    window.__mermaidReady = new Promise((resolve) => {
      mermaid.run().then(() => {
        fitDiagramsToPage();
        setTimeout(resolve, 500);
      }).catch(() => {
        setTimeout(resolve, 2000);
      });
    });
  </script>
` : '';

// ─── Build full HTML ───────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>${css}</style>
</head>
<body>
  <div class="page-wrapper">
    <h1 class="post-title">${title}</h1>
    <div class="markdown-content">
      ${bodyHtml}
    </div>
  </div>
  <!-- KaTeX auto-render for math -->
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body, {
      delimiters: [
        {left:'$$',right:'$$',display:true},
        {left:'$',right:'$',display:false}
      ]
    })"></script>
  ${mermaidScript}
</body>
</html>`;

// ─── Generate PDF via Puppeteer ────────────────────────────────────────────────
console.log(`Converting: ${inputPath}`);
console.log(`Theme: ${isDark ? 'dark' : 'light'} | Lang: ${lang}${hasMermaid ? ' | Mermaid: yes' : ''}`);

// Find chrome-headless-shell path
const cacheBase = `${homedir()}/.cache/puppeteer`;
let execPath;
try {
  const versions = readdirSync(`${cacheBase}/chrome-headless-shell`).filter(d => d.startsWith('mac_arm'));
  if (versions.length > 0) {
    const ver = versions[0];
    const inner = readdirSync(`${cacheBase}/chrome-headless-shell/${ver}`)[0];
    execPath = `${cacheBase}/chrome-headless-shell/${ver}/${inner}/chrome-headless-shell`;
  }
} catch {}
if (!execPath) execPath = puppeteer.executablePath();

const browser = await puppeteer.launch({
  headless: 'shell',
  executablePath: execPath,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for fonts
  await page.evaluateHandle('document.fonts.ready');

  // Wait for Mermaid rendering if present
  if (hasMermaid) {
    console.log('Waiting for Mermaid diagrams...');
    await page.evaluate(() => window.__mermaidReady).catch(() => {});
    // Extra safety margin for SVG painting
    await new Promise(r => setTimeout(r, 1000));
  }

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '48px',
      bottom: '80px',
      left: '0',
      right: '0',
    },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="
        width: 100%;
        height: 80px;
        font-size: 9px;
        color: ${isDark ? '#555' : '#aaa'};
        font-family: 'Noto Serif SC', serif;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 0 48px 20px;
        box-sizing: border-box;
      ">
        <span>${title}</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
  });

  console.log(`✓ PDF saved: ${outputPath}`);
} finally {
  await browser.close();
}
