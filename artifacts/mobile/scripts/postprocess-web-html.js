const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "..", "dist", "index.html");
const distDir = path.join(__dirname, "..", "dist");
const webAssetDir = path.join(__dirname, "..", "web");
const sourceIconPath = path.join(__dirname, "..", "assets", "images", "icon.png");
const defaultViewport =
  '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />';
const patchedViewport = [
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover" />',
  '<meta name="theme-color" content="#0d0d0d" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
].join("\n    ");
const shellStyle = [
  '<style id="app-shell">',
  '  html,',
  '  body,',
  '  #root {',
  '    background-color: #0d0d0d;',
  '  }',
  '',
  '  body {',
  '    margin: 0;',
  '    padding: 0;',
  '    overscroll-behavior: none;',
  '  }',
  '</style>',
].join("\n    ");

if (!fs.existsSync(filePath)) {
  throw new Error(`Missing exported HTML at ${filePath}`);
}

let html = fs.readFileSync(filePath, "utf8");

if (!html.includes('rel="manifest"')) {
  html = html.replace(
    "</head>",
    '    <link rel="manifest" href="/manifest.webmanifest" />\n    <link rel="apple-touch-icon" href="/app-icon.png" />\n  </head>',
  );
}

if (!html.includes("viewport-fit=cover")) {
  if (!html.includes(defaultViewport)) {
    throw new Error("Could not find Expo's default viewport meta tag.");
  }

  html = html.replace(defaultViewport, patchedViewport);
}

if (!html.includes('id="app-shell"')) {
  html = html.replace("</head>", `    ${shellStyle}\n  </head>`);
}

fs.writeFileSync(filePath, html);
fs.copyFileSync(sourceIconPath, path.join(distDir, "app-icon.png"));
fs.copyFileSync(path.join(webAssetDir, "sw.js"), path.join(distDir, "sw.js"));
fs.copyFileSync(path.join(webAssetDir, "manifest.webmanifest"), path.join(distDir, "manifest.webmanifest"));
console.log(`Patched ${filePath}`);
