/**
 * Renders `public/favicon.svg` to the square PNG electron-builder turns into
 * the Windows `.ico`.
 *
 * It uses the Electron that is already a devDependency rather than adding an
 * image library for one file a year: Chromium does the SVG rendering, a hidden
 * window is captured, and the result is written to `build/icon.png`.
 *
 * Run it with `npm run desktop:icon`, and only when the favicon changes —
 * `build/icon.png` is committed, so packaging never depends on this script
 * having been run.
 *
 * The output is square and transparent. Its pixel size follows the display's
 * scale factor, so it comes out larger than `SIZE` on a HiDPI screen; that is
 * harmless, because electron-builder downscales to the icon sizes Windows
 * wants and only needs at least 256.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SIZE = 1024;
const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "public/favicon.svg");
const target = path.join(projectRoot, "build/icon.png");

const svg = fs.readFileSync(source, "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; width: ${SIZE}px; height: ${SIZE}px;
               background: transparent; overflow: hidden; }
  svg { width: ${SIZE}px; height: ${SIZE}px; display: block; }
</style></head><body>${svg}</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
  });

  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  // The SVG is inline, so there is nothing to fetch — this is for layout and
  // the first paint, which `did-finish-load` does not guarantee has happened.
  await new Promise((resolve) => setTimeout(resolve, 600));

  const image = await win.capturePage();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, image.toPNG());

  const { width, height } = image.getSize();
  console.log(`wrote build/icon.png  ${width}x${height}`);
  app.quit();
});
