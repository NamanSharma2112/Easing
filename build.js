#!/usr/bin/env node
// Assembles the page from src/body.html into two outputs:
//   index.html     a standalone document for GitHub Pages or any static host
//   artifact.html  the same page without the document skeleton, for publishing
//                  as a Claude artifact (the host supplies <html>/<head>/<body>)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const body = readFileSync(join(root, 'src/body.html'), 'utf8').trimEnd();

const TITLE = 'Easing Lab';
const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600'
  + '&family=JetBrains+Mono:wght@400;500&display=swap';

const head = `<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONTS}" />
<link rel="stylesheet" href="styles.css" />`;

const script = '<script type="module" src="js/app.js"></script>';

writeFileSync(join(root, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="description" content="Compare CSS easing curves and springs side by side on the same interface animation." />
${head}
</head>
<body>
${body}
${script}
</body>
</html>
`);

writeFileSync(join(root, 'artifact.html'), `${head}
${body}
${script}
`);

console.log('built index.html and artifact.html');
