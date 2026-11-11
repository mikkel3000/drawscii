// Bundle the desktop editor's web frontend into desktop-dist/ for Tauri.
// `--serve` watches the sources and serves them on port 1420 with live reload
// for `tauri dev`; without it, a one-off production build for `tauri build`.
import { context } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const serve = process.argv.includes("--serve");
const PORT = 1420;

await mkdir("desktop-dist", { recursive: true });
await writeFile(
  "desktop-dist/index.html",
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Drawscii</title>
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="root"></div>
<script src="app.js"></script>${serve ? '\n<script src="livereload.js"></script>' : ""}
</body>
</html>
`,
);
// The dev server below announces each rebuild on /reload; reload on change.
// Kept as a file because the app's CSP blocks inline scripts.
await writeFile(
  "desktop-dist/livereload.js",
  serve
    ? 'new EventSource("/reload").addEventListener("change", () => location.reload());\n'
    : "",
);

// Live-reload listeners, notified after every successful watch rebuild.
const listeners = new Set();
const notify = {
  name: "notify-reload",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      for (const res of listeners) res.write("event: change\ndata: \n\n");
    });
  },
};

const ctx = await context({
  // main.tsx imports the CSS, so it is bundled (and watched) as app.css.
  entryPoints: { app: "src/standalone/main.tsx" },
  outdir: "desktop-dist",
  bundle: true,
  minify: !serve,
  sourcemap: serve,
  format: "iife",
  target: "es2020",
  define: {
    "process.env.NODE_ENV": serve ? '"development"' : '"production"',
  },
  logLevel: "info",
  plugins: serve ? [notify] : [],
});

if (serve) {
  await ctx.watch();
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".map": "application/json",
  };
  const root = normalize("desktop-dist");
  createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/reload") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });
      listeners.add(res);
      req.on("close", () => listeners.delete(res));
      return;
    }
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  }).listen(PORT, "127.0.0.1", () =>
    console.log(
      `Serving desktop-dist/ on http://127.0.0.1:${PORT} with live reload`,
    ),
  );
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("Built desktop-dist/");
}
