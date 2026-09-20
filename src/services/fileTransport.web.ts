import type { FileTransport } from "./fileTransport";

/**
 * The browser's two tricks, in one place.
 *
 * Both of these used to live inline in the pages that needed them
 * (`BackupPage`, `ManuscriptExportDialog`, `ImagePicker`). They are here now so
 * the desktop build can have real dialogs without any of those pages knowing
 * which platform they are on.
 *
 * `src/components/AGENTS.md` says an object URL that lives for one *action*
 * keeps create, click and revoke together in its handler. That rule still
 * holds — the handler simply moved here.
 */

export const transport: FileTransport = {
  save: async ({ suggestedName, data }) => {
    const url = URL.createObjectURL(data);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = suggestedName;
      link.click();
    } finally {
      // Together with the click, always — a URL left alive pins the Blob for
      // the life of the document.
      URL.revokeObjectURL(url);
    }
    // A download offers no completion signal of any kind. Saying `true` here
    // means "nothing went wrong", never "the author kept it".
    return { saved: true, name: suggestedName };
  },

  open: ({ accept }) =>
    new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";

      const settle = (value: Parameters<typeof resolve>[0]) => {
        input.remove();
        resolve(value);
      };

      input.addEventListener("change", () => {
        const file = input.files?.[0];
        settle(file ? { name: file.name, blob: file } : null);
      });
      // Without this the promise never settles when the author dismisses the
      // dialog, and every cancelled pick leaks a pending promise and an
      // element. Supported everywhere this app targets.
      input.addEventListener("cancel", () => settle(null));

      // Appended rather than clicked detached: Safari has historically ignored
      // a click on an input that is not in the document.
      document.body.append(input);
      input.click();
    }),
};
