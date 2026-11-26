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

/**
 * Every page the menu can open, and the only ones. A menu item never names a
 * tome, a plot or anything else in the library: the main process holds none
 * of that, and these are the library-level routes that need none of it.
 * `main.ts` turns one into a hash change, which the renderer's `HashRouter`
 * picks up like any link — `src/` has no menu code and no bridge member.
 */
export const menuRoutes = {
  library: "/tomes",
  newTome: "/tomes/new",
  guide: "/tomes/guide",
  authors: "/authors",
  activity: "/activity",
  backup: "/backup",
} as const;

export type MenuRoute = (typeof menuRoutes)[keyof typeof menuRoutes];

export interface MenuOptions {
  appName: string;
  /** The https-only wrapper from `main.ts`. Never `shell.openExternal` directly. */
  openExternal: (url: string) => void;
  /** Opens one of `menuRoutes` in the focused window. */
  navigate: (route: MenuRoute) => void;
  /** History in the focused window. The desktop window has no back button. */
  goBack: () => void;
  goForward: () => void;
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

/**
 * Back and Forward use the platform's browser convention, and both pairs are
 * chosen to miss the editor: Alt+Left/Right is no text-editing key on Windows
 * or Linux, and Cmd+[ / Cmd+] is none on macOS — where Alt+Left *is* one
 * (word jump), which is why the Mac does not get the Windows pair.
 */
const goMenu = ({ navigate, goBack, goForward }: MenuOptions): MenuItemConstructorOptions => ({
  label: "Go",
  submenu: [
    { label: "Back", accelerator: isMac ? "Cmd+[" : "Alt+Left", click: goBack },
    { label: "Forward", accelerator: isMac ? "Cmd+]" : "Alt+Right", click: goForward },
    { type: "separator" },
    { label: "Library", click: () => navigate(menuRoutes.library) },
    { label: "Authors", click: () => navigate(menuRoutes.authors) },
    { label: "Activity", click: () => navigate(menuRoutes.activity) },
  ],
});

export function buildApplicationMenu(options: MenuOptions): Menu {
  const { appName, openExternal, navigate, isDev } = options;
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
      submenu: [
        { label: "New Tome…", accelerator: "CmdOrCtrl+N", click: () => navigate(menuRoutes.newTome) },
        { type: "separator" },
        { label: "Backup && Restore…", click: () => navigate(menuRoutes.backup) },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    editMenu,
    viewMenu(isDev),
    goMenu(options),
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
        { label: "Getting Started Guide", click: () => navigate(menuRoutes.guide) },
        {
          label: "myTome on GitHub",
          click: () => openExternal(repositoryUrl),
        },
        // macOS has About under the app menu. Elsewhere the role opens
        // Electron's own message box, filled by `setAboutPanelOptions` in main.ts.
        ...(isMac ? [] : ([{ type: "separator" }, { role: "about" }] satisfies MenuItemConstructorOptions[])),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
