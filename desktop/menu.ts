import { Menu, type MenuItemConstructorOptions } from "electron";

/**
 * The application menu.
 *
 * On Windows and Linux this is a convenience. **On macOS it is load-bearing.**
 * Cmd+C and its siblings are menu *key equivalents*: pressing one makes AppKit
 * walk the menu bar looking for an item that claims it, and fire that item's
 * action. If nothing claims the keystroke, nothing happens — it is swallowed
 * before the web view ever sees it.
 *
 * Electron installs a default menu carrying the Edit roles for exactly this
 * reason, and `Menu.setApplicationMenu` **replaces that default outright
 * rather than merging with it.** So the moment this file exists, the Edit
 * submenu below stops being garnish: without it, Cmd+C, Cmd+V, Cmd+X, Cmd+A
 * and Cmd+Z are dead everywhere in the app, the Lexical editor included.
 *
 * That failure cannot occur on the platform this is developed on, and no test
 * under `node` can see it. See docs/desktop-app.md, "The macOS Edit menu".
 *
 * Electron's `role` values carry the right accelerator and action per
 * platform, so nothing here wires a shortcut or touches the clipboard itself.
 */

const isMac = process.platform === "darwin";

export interface MenuOptions {
  appName: string;
  /** The https-only wrapper from `main.ts`. Never `shell.openExternal` directly. */
  openExternal: (url: string) => void;
  /** Dev builds get the reload and DevTools items; see `viewMenu`. */
  isDev: boolean;
}

const repositoryUrl = "https://github.com/atikunea/myTome";

/**
 * The reason every entry here is a `role`: roles are the only way to get the
 * platform's own accelerator *and* have macOS recognise the item as the
 * standard one. A hand-written `accelerator` plus a `click` handler looks
 * identical and does not work the same.
 */
const editMenu: MenuItemConstructorOptions = {
  label: "Edit",
  submenu: [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    // Cmd/Ctrl+Shift+V. Worth having in a writing app specifically: the paste
    // target is a rich-text Lexical editor and the source is often a web page.
    { role: "pasteAndMatchStyle" },
    { role: "delete" },
    { role: "selectAll" },
  ],
};

/**
 * Reload and DevTools are dev-only for now. `docs/desktop-app.md` leaves the
 * packaged-build DevTools question open on purpose — it is a decision about
 * who can read the library, not a default to drift into.
 */
const viewMenu = (isDev: boolean): MenuItemConstructorOptions => ({
  label: "View",
  submenu: [
    ...(isDev
      ? ([{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" }] satisfies MenuItemConstructorOptions[])
      : []),
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ],
});

export function buildApplicationMenu({ appName, openExternal, isDev }: MenuOptions): Menu {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: appName,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    editMenu,
    viewMenu(isDev),
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        ...(isMac
          ? ([{ role: "zoom" }, { type: "separator" }, { role: "front" }] satisfies MenuItemConstructorOptions[])
          : ([{ role: "close" }] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "myTome on GitHub",
          click: () => openExternal(repositoryUrl),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
