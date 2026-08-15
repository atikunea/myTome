import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Subscription } from "dexie";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { Tome, TomeStatus } from "../models/Tome";
import { imageFrom, store } from "../services/store";
import "./app-header";
import "./confirm-dialog";
import "./side-nav";
import "../pages/tome-dashboard-page";
import "../pages/tome-library-page";
import "../pages/element-list-page";
import "../pages/element-types-page";
type Route = {
  page: "library" | "tome" | "elements" | "types";
  tomeId?: string;
  typeId?: string;
  editId?: string;
  fresh?: boolean;
};
const route = (): Route => {
  const bits = location.hash.slice(1).split("/").filter(Boolean);
  if (bits[0] !== "tomes") return { page: "library" };
  if (!bits[1] || bits[1] === "new")
    return { page: "library", fresh: bits[1] === "new" };
  if (bits[2] === "elements" && bits[3] === "settings")
    return {
      page: "types",
      tomeId: bits[1],
      editId: bits[4],
      fresh: bits[4] === "new",
    };
  if (bits[2] === "elements")
    return {
      page: "elements",
      tomeId: bits[1],
      typeId: bits[3],
      editId: bits[5] === "edit" ? bits[4] : bits[4],
      fresh: bits[4] === "new",
    };
  return {
    page: "tome",
    tomeId: bits[1],
    editId: bits[2] === "edit" ? bits[1] : undefined,
  };
};
const go = (value: string) => {
  location.hash = value;
};
const input = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? "");
@customElement("app-shell")
export class AppShell extends LitElement {
  @state()
  private current = route();
  @state()
  private tomes: Tome[] = [];
  @state()
  private tome?: Tome;
  @state()
  private types: ElementType[] = [];
  @state()
  private elements: Element[] = [];
  @state()
  private message = "";
  @state()
  private confirm?: {
    text: string;
    action: () => Promise<void>;
  };
  private subscriptions: Subscription[] = [];
  connectedCallback() {
    super.connectedCallback();
    addEventListener("hashchange", this.onRoute);
    this.sync();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    removeEventListener("hashchange", this.onRoute);
    this.clearSubs();
  }
  private onRoute = () => {
    this.current = route();
    this.message = "";
    this.sync();
  };
  private clearSubs() {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.subscriptions = [];
  }
  private sync() {
    this.clearSubs();
    this.subscriptions.push(store.observeTomes((v) => (this.tomes = v)));
    if (this.current.tomeId) {
      this.subscriptions.push(
        store.observeTome(this.current.tomeId, (v) => (this.tome = v)),
      );
      this.subscriptions.push(
        store.observeTypes(this.current.tomeId!, (v) => (this.types = v)),
      );
    } else {
      this.tome = undefined;
      this.types = [];
    }
    if (
      this.current.page === "elements" &&
      this.current.tomeId &&
      this.current.typeId
    )
      this.subscriptions.push(
        store.observeElements(
          this.current.tomeId,
          this.current.typeId,
          (v) => (this.elements = v),
        ),
      );
    else this.elements = [];
  }
  private async submitTome(e: SubmitEvent) {
    e.preventDefault();
    try {
      const form = e.currentTarget as HTMLFormElement;
      const existing = this.current.editId
        ? this.tomes.find((x) => x.id === this.current.editId)
        : undefined;
      const cover = await imageFrom(
        input(form, "coverUrl"),
        (form.elements.namedItem("coverFile") as HTMLInputElement).files?.[0],
      );
      const saved = await store.saveTome({
        id: existing?.id,
        title: input(form, "title"),
        subtitle: input(form, "subtitle"),
        description: input(form, "description"),
        status: input(form, "status") as TomeStatus,
        coverImage: cover ?? existing?.coverImage,
      });
      if (!existing) await store.createStarterTypes(saved.id);
      go(`/tomes/${saved.id}/dashboard`);
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : "Could not save tome.";
    }
  }
  private ask(text: string, action: () => Promise<void>) {
    this.confirm = { text, action };
  }
  private async accept() {
    try {
      await this.confirm?.action();
      this.confirm = undefined;
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : "Could not complete action.";
    }
  }
  render() {
    if (this.current.page === "library") return this.library();
    if (!this.tome) return html`<main class="center">Loading tome…</main>`;
    return html`<div class="workspace">
        ${this.nav()}
        <main>
          ${this.header()}${this.current.page === "tome"
            ? this.dashboard()
            : this.current.page === "types"
              ? html`<element-types-page
                  .tomeId=${this.tome.id}
                  .types=${this.types}
                  .editId=${this.current.editId}
                  .fresh=${this.current.fresh}
                  @request-confirm=${this.onConfirmRequest}
                ></element-types-page>`
              : html`<element-list-page
                  .tomeId=${this.tome.id}
                  .type=${this.types.find(
                    (type) => type.id === this.current.typeId,
                  )}
                  .elements=${this.elements}
                  .editId=${this.current.editId}
                  .fresh=${this.current.fresh}
                  @request-confirm=${this.onConfirmRequest}
                ></element-list-page>`}
        </main>
      </div>
      ${this.confirmDialog()}`;
  }
  private onConfirmRequest(
    event: CustomEvent<{ text: string; action: () => Promise<void> }>,
  ) {
    this.ask(event.detail.text, event.detail.action);
  }
  private library() {
    const editing = this.current.editId
      ? this.tomes.find((x) => x.id === this.current.editId)
      : undefined;
    return html`<tome-library-page
        .tomes=${this.tomes}
        @create-tome=${() => go("/tomes/new")}
        @open-tome=${(event: CustomEvent<Tome>) =>
          go(`/tomes/${event.detail.id}/dashboard`)}
        @edit-tome=${(event: CustomEvent<Tome>) =>
          go(`/tomes/${event.detail.id}/edit`)}
        @delete-tome=${(event: CustomEvent<Tome>) =>
          this.ask(
            `Permanently delete “${event.detail.title}” and everything in it? This cannot be undone.`,
            async () => {
              await store.deleteTome(event.detail.id);
            },
          )}
      ></tome-library-page>
      ${this.current.fresh || editing ? this.tomeForm(editing) : nothing}
      ${this.confirmDialog()}`;
  }
  private tomeForm(t?: Tome) {
    return html`<div class="modal">
      <form class="dialog" @submit=${this.submitTome}>
        <header>
          <h2>${t ? "Edit tome" : "Create a tome"}</h2>
          <button class="plain" type="button" @click=${() => go("/tomes")}>
            ×
          </button>
        </header>
        ${this.error()}<label
          >Title<input required name="title" .value=${t?.title ?? ""} /></label
        ><label
          >Subtitle<input name="subtitle" .value=${t?.subtitle ?? ""} /></label
        ><label
          >Description<textarea name="description">
${t?.description ?? ""}</textarea
          ></label
        ><label
          >Status<select name="status" .value=${t?.status ?? "Draft"}>
            <option>Draft</option>
            <option>Completed</option>
            <option>Archived</option>
          </select></label
        ><label
          >Cover image URL<input
            name="coverUrl"
            placeholder="https://…" /></label
        ><label
          >Or upload an image<input
            name="coverFile"
            type="file"
            accept="image/*"
        /></label>
        <footer>
          <button class="plain" type="button" @click=${() => go("/tomes")}>
            Cancel</button
          ><button>Save tome</button>
        </footer>
      </form>
    </div>`;
  }
  private nav() {
    return html`<side-nav
      .tome=${this.tome}
      .types=${this.types}
      .page=${this.current.page}
      .typeId=${this.current.typeId}
    ></side-nav>`;
  }
  private header() {
    return html`<app-header .tome=${this.tome}></app-header>`;
  }
  private dashboard() {
    return html`<tome-dashboard-page .tome=${this.tome}></tome-dashboard-page>
      ${this.current.editId ? this.tomeForm(this.tome) : nothing}`;
  }
  private error() {
    return this.message
      ? html`<p class="error" role="alert">${this.message}</p>`
      : nothing;
  }
  private confirmDialog() {
    return this.confirm
      ? html`<confirm-dialog
          .message=${this.confirm.text}
          @cancel=${() => (this.confirm = undefined)}
          @confirm=${this.accept}
        ></confirm-dialog>`
      : nothing;
  }
  static styles = css`
    :host {
      display: block;
      color: var(--ink);
    }
    main {
      min-height: 100vh;
      padding: 48px clamp(20px, 5vw, 76px);
      box-sizing: border-box;
      background: var(--paper);
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    h1 {
      font-size: clamp(2rem, 5vw, 3.4rem);
      letter-spacing: -0.05em;
    }
    h2 {
      font-size: 1.7rem;
    }
    h3 {
      font-size: 1.15rem;
    }
    .muted,
    .hint,
    small {
      color: var(--muted);
    }
    .eyebrow,
    .nav-label {
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.12em;
    }
    .library > header,
    .page-head,
    .tome-head,
    .editor > header,
    .dialog > header,
    .field-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .library > header {
      margin-bottom: 36px;
    }
    .library header .muted {
      margin-top: 10px;
    }
    button {
      border: 0;
      border-radius: 9px;
      padding: 11px 15px;
      background: var(--accent);
      color: white;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    button:hover {
      filter: brightness(0.94);
    }
    button.plain {
      background: transparent;
      color: var(--ink);
      padding: 8px;
    }
    .danger {
      background: #b63b3b !important;
      color: white !important;
    }
    .toolbar {
      display: flex;
      gap: 12px;
      margin-bottom: 28px;
      flex-wrap: wrap;
    }
    .toolbar input {
      flex: 1;
      min-width: 180px;
    }
    .toolbar select {
      width: auto;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
      gap: 20px;
    }
    .card,
    .type-list article {
      background: white;
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 3px 14px #281b1609;
    }
    .cover {
      width: 100%;
      height: 142px;
      display: block;
      object-fit: cover;
      background: #eee;
    }
    .fallback {
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #d7b799, #8e6048);
      color: white;
      font-size: 3rem;
      font-family: Georgia;
    }
    .card-body {
      padding: 17px;
    }
    .card h2 {
      font-size: 1.35rem;
      margin: 9px 0;
    }
    .card h3 {
      margin-bottom: 7px;
    }
    .card p {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .card footer,
    .type-list footer {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 14px;
    }
    .badge {
      font-size: 0.68rem;
      font-weight: 800;
      padding: 4px 7px;
      border-radius: 99px;
      background: #eee;
    }
    .draft {
      background: #f9ebc3;
    }
    .completed {
      background: #d7ecd9;
    }
    .archived {
      background: #e5e1e8;
    }
    .modal {
      position: fixed;
      inset: 0;
      background: #21150b77;
      display: grid;
      place-items: center;
      padding: 20px;
      z-index: 5;
    }
    .dialog,
    .editor {
      background: white;
      border-radius: 15px;
      padding: 26px;
      width: min(600px, 100%);
      box-sizing: border-box;
      box-shadow: 0 18px 60px #0004;
    }
    .dialog label,
    .editor label {
      display: block;
      margin: 14px 0;
      font-weight: 700;
      font-size: 0.9rem;
    }
    .dialog footer,
    .editor footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 22px;
    }
    .error {
      padding: 10px;
      background: #ffe1e1;
      color: #8f2020;
      border-radius: 8px;
      margin-top: 14px;
    }
    .workspace {
      display: grid;
      grid-template-columns: 238px 1fr;
      min-height: 100vh;
    }
    .workspace main {
      min-width: 0;
    }
    aside {
      background: #27201c;
      color: #eee;
      padding: 31px 20px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .brand {
      font-family: Georgia;
      font-size: 1.7rem;
      color: #fff;
      text-decoration: none;
      margin-bottom: 36px;
    }
    .nav-label {
      margin: 18px 9px 5px;
      color: #bfa998;
    }
    aside a:not(.brand) {
      color: #dfd7d1;
      text-decoration: none;
      padding: 9px;
      border-radius: 7px;
    }
    aside a.active,
    aside a:not(.brand):hover {
      background: #44372f;
      color: white;
    }
    .tome-head {
      border-bottom: 1px solid var(--line);
      padding-bottom: 25px;
      margin-bottom: 40px;
    }
    .back {
      font-size: 0.85rem;
      color: var(--muted);
      text-decoration: none;
      display: block;
      margin-bottom: 9px;
    }
    .summary {
      max-width: 680px;
    }
    .summary h2 {
      margin: 10px 0;
    }
    .summary > p:not(.eyebrow) {
      line-height: 1.6;
      color: var(--muted);
    }
    .callout {
      margin-top: 28px;
      padding: 18px;
      background: #fbf3e7;
      border-radius: 11px;
      line-height: 1.45;
    }
    .page-head {
      margin-bottom: 25px;
    }
    .page-head p {
      margin-top: 8px;
    }
    .type-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 15px;
    }
    .type-list article {
      padding: 20px;
    }
    .type-list p {
      color: var(--muted);
      margin: 8px 0;
    }
    .editor {
      width: min(750px, 100%);
      border: 1px solid var(--line);
      box-shadow: none;
    }
    .editor > header {
      margin-bottom: 24px;
    }
    .editor input,
    .editor select,
    .editor textarea,
    .dialog input,
    .dialog select,
    .dialog textarea,
    input,
    select,
    textarea {
      font: inherit;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      box-sizing: border-box;
      width: 100%;
      background: white;
      color: var(--ink);
      margin-top: 5px;
    }
    textarea {
      min-height: 90px;
      resize: vertical;
    }
    .field {
      display: grid;
      grid-template-columns: 1.3fr 1fr auto 1.5fr auto;
      gap: 8px;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--line);
    }
    .field label {
      margin: 0 !important;
      white-space: nowrap;
    }
    .field input,
    .field select {
      margin: 0;
    }
    .element-list {
      display: grid;
      gap: 10px;
    }
    .element-list .card {
      display: flex;
    }
    .element-list .cover {
      width: 110px;
      height: auto;
    }
    .element-list .card-body {
      flex: 1;
    }
    .empty {
      padding: 44px;
      text-align: center;
      border: 1px dashed var(--line);
      border-radius: 14px;
      color: var(--muted);
      margin-top: 18px;
    }
    .center {
      display: grid;
      place-items: center;
    }
    .confirm {
      width: min(430px, 100%);
    }
    @media (max-width: 700px) {
      .workspace {
        display: block;
      }
      .workspace aside {
        padding: 14px;
        flex-direction: row;
        overflow: auto;
        align-items: center;
        white-space: nowrap;
      }
      .brand {
        margin: 0 12px 0 0;
        font-size: 1.25rem;
      }
      .nav-label {
        display: none;
      }
      .workspace aside a:not(.brand) {
        padding: 7px;
      }
      .workspace main,
      main {
        padding: 27px 18px;
      }
      .library > header,
      .page-head,
      .tome-head {
        align-items: flex-start;
        flex-direction: column;
      }
      .field {
        grid-template-columns: 1fr 1fr;
      }
      .field label {
        grid-column: 1/2;
      }
      .field [name="field-options"] {
        grid-column: 1/-1;
      }
      .field .remove-field {
        justify-self: start;
      }
      .element-list .card {
        display: block;
      }
      .element-list .cover {
        width: 100%;
        height: 120px;
      }
    }
  `;
}
