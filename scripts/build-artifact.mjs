// Inline the artifact build into one self-contained page (React from cdnjs, fonts from Google Fonts).
import { readFileSync, writeFileSync } from "node:fs";

const js = readFileSync("dist-artifact/app.js", "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync("dist-artifact/app.css", "utf8");
const page = `<title>Plumbline</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..800&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
writeFileSync("dist-artifact/plumbline.html", page);
console.log(`wrote dist-artifact/plumbline.html (${(page.length / 1024).toFixed(1)} KB)`);
