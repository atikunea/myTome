import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Subscription } from "dexie";
import type { ElementType, FieldDefinition } from "../models/ElementType";
import type { Element } from "../models/Element";
import type { Tome, TomeStatus } from "../models/Tome";
import { imageFrom, imageUrl, store } from "../services/store";
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
  private query = "";
  @state()
  private status = "All";
  @state()
  private sort = "recent";
  @state()
  private list = false;
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
    this.query = "";
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
  private async submitType(e: SubmitEvent) {
    e.preventDefault();
    try {
      const form = e.currentTarget as HTMLFormElement;
      const editing =
        this.current.editId && this.current.editId !== "new"
          ? this.types.find((x) => x.id === this.current.editId)
          : undefined;
      const fields = this.readFields(form, editing?.fieldDefinitions ?? []);
      const saved = await store.saveType({
        id: editing?.id,
        tomeId: this.current.tomeId!,
        name: input(form, "name"),
        description: input(form, "description"),
        fieldDefinitions: fields,
      });
      go(`/tomes/${saved.tomeId}/elements/settings`);
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : "Could not save element type.";
    }
  }
  private readFields(form: HTMLFormElement, old: FieldDefinition[]) {
    return [...form.querySelectorAll<HTMLElement>("[data-field]")].map(
      (row, index) => {
        const id = row.dataset.id || old[index]?.id || crypto.randomUUID();
        const name = (
          row.querySelector('[name="field-name"]') as HTMLInputElement
        ).value;
        const kind = (
          row.querySelector('[name="field-kind"]') as HTMLSelectElement
        ).value as "text" | "select";
        const options = (
          row.querySelector('[name="field-options"]') as HTMLInputElement
        ).value
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        return {
          id,
          name,
          kind,
          options,
          required: (
            row.querySelector('[name="field-required"]') as HTMLInputElement
          ).checked,
          sortOrder: index,
        };
      },
    );
  }
  private async submitElement(e: SubmitEvent) {
    e.preventDefault();
    try {
      const form = e.currentTarget as HTMLFormElement;
      const type = this.types.find((x) => x.id === this.current.typeId);
      if (!type) return;
      const existing =
        this.current.editId && this.current.editId !== "new"
          ? this.elements.find((x) => x.id === this.current.editId)
          : undefined;
      const attrs: Record<string, string> = {};
      type.fieldDefinitions.forEach(
        (field) => (attrs[field.id] = input(form, `attr-${field.id}`)),
      );
      const saved = await store.saveElement({
        id: existing?.id,
        tomeId: this.current.tomeId!,
        elementTypeId: type.id,
        name: input(form, "name"),
        description: input(form, "description"),
        attributes: attrs,
        image:
          (await imageFrom(
            input(form, "imageUrl"),
            (form.elements.namedItem("imageFile") as HTMLInputElement)
              .files?.[0],
          )) ?? existing?.image,
      });
      go(`/tomes/${saved.tomeId}/elements/${saved.elementTypeId}`);
    } catch (error) {
      this.message =
        error instanceof Error ? error.message : "Could not save element.";
    }
  }
  private addField() {
    const editor = this.renderRoot.querySelector("#field-list");
    editor?.insertAdjacentHTML(
      "beforeend",
      `<div class="field" data-field><input name="field-name" placeholder="Field name"><select name="field-kind"><option value="text">Text</option><option value="select">Configurable list</option></select><label><input name="field-required" type="checkbox"> Required</label><input name="field-options" placeholder="Choices, separated by commas"><button type="button" class="plain remove-field">Remove</button></div>`,
    );
    this.requestUpdate();
  }
  private async fieldAction(e: Event) {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("remove-field")) return;
    const row = target.closest<HTMLElement>("[data-field]");
    const fieldId = row?.dataset.id;
    const type = this.types.find((x) => x.id === this.current.editId);
    if (!row) return;
    if (!fieldId || !type) {
      row.remove();
      return;
    }
    const field = type.fieldDefinitions.find((x) => x.id === fieldId);
    const count = await store.countField(type.id, fieldId);
    this.ask(
      `Remove “${field?.name ?? "this field"}”? ${count} stored value${count === 1 ? "" : "s"} will be permanently deleted.`,
      async () => {
        await store.deleteField(type, fieldId);
        row.remove();
      },
    );
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
  private filteredTomes() {
    const needle = this.query.toLowerCase();
    return this.tomes.filter(
      (x) =>
        (this.status === "All" || x.status === this.status) &&
        `${x.title} ${x.subtitle ?? ""}`.toLowerCase().includes(needle),
    );
  }
  private filteredElements() {
    const needle = this.query.toLowerCase();
    return [...this.elements]
      .filter((x) =>
        `${x.name} ${x.description}`.toLowerCase().includes(needle),
      )
      .sort((a, b) =>
        this.sort === "name"
          ? a.name.localeCompare(b.name)
          : b.updatedAt.localeCompare(a.updatedAt),
      );
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
              ? this.typeSettings()
              : this.elementPage()}
        </main>
      </div>
      ${this.confirmDialog()}`;
  }
  private library() {
    const editing = this.current.editId
      ? this.tomes.find((x) => x.id === this.current.editId)
      : undefined;
    return html`<main class="library">
      <header>
        <div>
          <p class="eyebrow">MY TOME</p>
          <h1>Your story library</h1>
          <p class="muted">A quiet place to keep every world together.</p>
        </div>
        <button @click=${() => go("/tomes/new")}>+ New tome</button>
      </header>
      <section class="toolbar">
        <input
          aria-label="Search tomes"
          placeholder="Search by title…"
          .value=${this.query}
          @input=${(e: InputEvent) =>
            (this.query = (e.target as HTMLInputElement).value)}
        /><select
          aria-label="Filter status"
          @change=${(e: Event) =>
            (this.status = (e.target as HTMLSelectElement).value)}
        >
          <option>All</option>
          <option>Draft</option>
          <option>Completed</option>
          <option>Archived</option>
        </select>
      </section>
      <section class="cards">
        ${this.filteredTomes().map(
          (t) =>
            html`<article class="card">
              ${this.image(t.coverImage, t.title)}
              <div class="card-body">
                <span class="badge ${t.status.toLowerCase()}">${t.status}</span>
                <h2>${t.title}</h2>
                <p>${t.subtitle || t.description || "No description yet."}</p>
                <footer>
                  <button
                    class="plain"
                    @click=${() => go(`/tomes/${t.id}/dashboard`)}
                  >
                    Open</button
                  ><button
                    class="plain"
                    @click=${() => go(`/tomes/${t.id}/edit`)}
                  >
                    Edit</button
                  ><button
                    class="danger plain"
                    @click=${() =>
                      this.ask(
                        `Permanently delete “${t.title}” and everything in it? This cannot be undone.`,
                        async () => {
                          await store.deleteTome(t.id);
                        },
                      )}
                  >
                    Delete
                  </button>
                </footer>
              </div>
            </article>`,
        )}${!this.filteredTomes().length
          ? html`<div class="empty">
              <h2>No tomes found</h2>
              <p>Create a tome to start shaping a new story.</p>
            </div>`
          : nothing}
      </section>
      ${this.current.fresh || editing
        ? this.tomeForm(editing)
        : nothing}${this.confirmDialog()}
    </main>`;
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
    return html`<aside>
      <a class="brand" href="#/tomes">myTome</a>
      <p class="nav-label">${this.tome!.title}</p>
      <a
        href=${`#/tomes/${this.tome!.id}/dashboard`}
        class=${this.current.page === "tome" ? "active" : ""}
        >Overview</a
      >
      <p class="nav-label">ELEMENTS</p>
      ${this.types.map(
        (type) =>
          html`<a
            href=${`#/tomes/${this.tome!.id}/elements/${type.id}`}
            class=${this.current.typeId === type.id ? "active" : ""}
            >${type.name}</a
          >`,
      )}<a
        href=${`#/tomes/${this.tome!.id}/elements/settings`}
        class=${this.current.page === "types" ? "active" : ""}
        >⚙ Manage types</a
      >
    </aside>`;
  }
  private header() {
    return html`<header class="tome-head">
      <div>
        <a class="back" href="#/tomes">← Library</a>
        <h1>${this.tome!.title}</h1>
      </div>
      <button class="plain" @click=${() => go(`/tomes/${this.tome!.id}/edit`)}>
        Edit tome
      </button>
    </header>`;
  }
  private dashboard() {
    return html`<section class="summary">
        <p class="eyebrow">TOME OVERVIEW</p>
        <h2>${this.tome!.subtitle || "A home for your story"}</h2>
        <p>
          ${this.tome!.description ||
          "Add a description to give this tome its north star."}
        </p>
        <div class="callout">
          Use the Elements navigation to define the people, places, ideas, and
          events in this world.
        </div>
      </section>
      ${this.current.editId ? this.tomeForm(this.tome) : nothing}`;
  }
  private typeSettings() {
    const editing =
      this.current.fresh || this.current.editId
        ? this.types.find((x) => x.id === this.current.editId)
        : undefined;
    return html`<section class="page-head">
        <div>
          <p class="eyebrow">ELEMENT CONFIGURATION</p>
          <h2>Element types</h2>
          <p class="muted">Define the building blocks for this tome.</p>
        </div>
        <button
          @click=${() => go(`/tomes/${this.tome!.id}/elements/settings/new`)}
        >
          + New type
        </button>
      </section>
      ${!editing && !this.current.fresh
        ? html`<section class="type-list">
            ${this.types.map(
              (type) =>
                html`<article>
                  <h3>${type.name}</h3>
                  <p>${type.description || "No description"}</p>
                  <small
                    >${type.fieldDefinitions.length} custom
                    field${type.fieldDefinitions.length === 1 ? "" : "s"}</small
                  >
                  <footer>
                    <button
                      class="plain"
                      @click=${() =>
                        go(
                          `/tomes/${this.tome!.id}/elements/settings/${type.id}`,
                        )}
                    >
                      Configure</button
                    ><button
                      class="danger plain"
                      @click=${async () =>
                        this.ask(
                          `Permanently delete “${type.name}” and all ${await store.countElements(type.id)} of its elements? This cannot be undone.`,
                          async () => {
                            await store.deleteType(type);
                            go(`/tomes/${this.tome!.id}/elements/settings`);
                          },
                        )}
                    >
                      Delete
                    </button>
                  </footer>
                </article>`,
            )}
          </section>`
        : this.typeForm(editing)}`;
  }
  private typeForm(type?: ElementType) {
    const fields = type?.fieldDefinitions ?? [];
    return html`<form
      class="editor"
      @submit=${this.submitType}
      @click=${this.fieldAction}
    >
      <header>
        <h2>${type ? `Configure ${type.name}` : "New element type"}</h2>
        <button
          class="plain"
          type="button"
          @click=${() => go(`/tomes/${this.tome!.id}/elements/settings`)}
        >
          Cancel
        </button>
      </header>
      ${this.error()}<label
        >Name<input required name="name" .value=${type?.name ?? ""} /></label
      ><label
        >Description<textarea name="description">
${type?.description ?? ""}</textarea
        >
      </label>
      <div class="field-title">
        <h3>Custom fields</h3>
        <button type="button" class="plain" @click=${this.addField}>
          + Add field
        </button>
      </div>
      <div id="field-list">
        ${fields.map(
          (f) =>
            html`<div class="field" data-field data-id=${f.id}>
              <input
                name="field-name"
                placeholder="Field name"
                .value=${f.name}
              /><select name="field-kind" .value=${f.kind}>
                <option value="text">Text</option>
                <option value="select">Configurable list</option></select
              ><label
                ><input
                  name="field-required"
                  type="checkbox"
                  .checked=${f.required}
                />
                Required</label
              ><input
                name="field-options"
                placeholder="Choices, separated by commas"
                .value=${(f.options ?? []).join(", ")}
              /><button type="button" class="plain remove-field">Remove</button>
            </div>`,
        )}
      </div>
      <p class="hint">
        For configurable lists, enter choices separated by commas. Removing a
        field deletes its stored values after confirmation.
      </p>
      <footer><button>Save type</button></footer>
    </form>`;
  }
  private elementPage() {
    const type = this.types.find((x) => x.id === this.current.typeId);
    if (!type)
      return html`<section class="empty">
        <h2>Element type not found</h2>
        <a href=${`#/tomes/${this.tome!.id}/elements/settings`}>Manage types</a>
      </section>`;
    const editing =
      this.current.fresh || this.current.editId
        ? this.elements.find((x) => x.id === this.current.editId)
        : undefined;
    if (this.current.fresh || editing) return this.elementForm(type, editing);
    const items = this.filteredElements();
    return html`<section class="page-head">
        <div>
          <p class="eyebrow">${type.name.toUpperCase()}S</p>
          <h2>${type.name}s</h2>
        </div>
        <button
          @click=${() => go(`/tomes/${this.tome!.id}/elements/${type.id}/new`)}
        >
          + New ${type.name}
        </button>
      </section>
      <section class="toolbar">
        <input
          aria-label="Search elements"
          placeholder="Search ${type.name.toLowerCase()}s…"
          @input=${(e: InputEvent) =>
            (this.query = (e.target as HTMLInputElement).value)}
        /><select
          @change=${(e: Event) =>
            (this.sort = (e.target as HTMLSelectElement).value)}
        >
          <option value="recent">Recently updated</option>
          <option value="name">Name</option></select
        ><button class="plain" @click=${() => (this.list = !this.list)}>
          ${this.list ? "Grid view" : "List view"}
        </button>
      </section>
      <section class=${this.list ? "element-list" : "cards"}>
        ${items.map(
          (item) =>
            html`<article class="card element-card">
              ${this.image(item.image, item.name)}
              <div class="card-body">
                <h3>${item.name}</h3>
                <p>${item.description || "No description yet."}</p>
                ${type.fieldDefinitions
                  .filter((f) => item.attributes[f.id])
                  .slice(0, 2)
                  .map(
                    (f) =>
                      html`<small>${f.name}: ${item.attributes[f.id]}</small>`,
                  )}
                <footer>
                  <button
                    class="plain"
                    @click=${() =>
                      go(
                        `/tomes/${this.tome!.id}/elements/${type.id}/${item.id}/edit`,
                      )}
                  >
                    Edit</button
                  ><button
                    class="danger plain"
                    @click=${() =>
                      this.ask(
                        `Permanently delete “${item.name}”? This cannot be undone.`,
                        async () => {
                          await store.deleteElement(item.id);
                        },
                      )}
                  >
                    Delete
                  </button>
                </footer>
              </div>
            </article>`,
        )}
      </section>
      ${!items.length
        ? html`<div class="empty">
            <h2>No ${type.name.toLowerCase()}s yet</h2>
            <p>Create one to begin filling out this world.</p>
          </div>`
        : nothing}`;
  }
  private elementForm(type: ElementType, item?: Element) {
    return html`<form class="editor" @submit=${this.submitElement}>
      <header>
        <h2>${item ? `Edit ${item.name}` : `New ${type.name}`}</h2>
        <button
          class="plain"
          type="button"
          @click=${() => go(`/tomes/${this.tome!.id}/elements/${type.id}`)}
        >
          Cancel
        </button>
      </header>
      ${this.error()}<label
        >Name<input required name="name" .value=${item?.name ?? ""} /></label
      ><label
        >Description<textarea name="description">
${item?.description ?? ""}</textarea
        ></label
      >${type.fieldDefinitions.map(
        (field) =>
          html`<label
            >${field.name}${field.required ? " *" : ""}${field.kind === "select"
              ? html`<select name=${`attr-${field.id}`}>
                  <option value="">Select…</option>
                  ${(field.options ?? []).map(
                    (o) =>
                      html`<option
                        value=${o}
                        ?selected=${item?.attributes[field.id] === o}
                      >
                        ${o}
                      </option>`,
                  )}
                </select>`
              : html`<input
                  name=${`attr-${field.id}`}
                  .value=${item?.attributes[field.id] ?? ""}
                />`}</label
          >`,
      )}<label>Image URL<input name="imageUrl" placeholder="https://…" /></label
      ><label
        >Or upload an image<input name="imageFile" type="file" accept="image/*"
      /></label>
      <footer><button>Save ${type.name}</button></footer>
    </form>`;
  }
  private image(source: Tome["coverImage"] | Element["image"], name: string) {
    const url = imageUrl(source);
    return url
      ? html`<img class="cover" src=${url} alt="${name} cover" />`
      : html`<div class="cover fallback" aria-hidden="true">
          ${name.slice(0, 1).toUpperCase()}
        </div>`;
  }
  private error() {
    return this.message
      ? html`<p class="error" role="alert">${this.message}</p>`
      : nothing;
  }
  private confirmDialog() {
    return this.confirm
      ? html`<div class="modal">
          <section class="dialog confirm" role="alertdialog" aria-modal="true">
            <h2>Are you sure?</h2>
            <p>${this.confirm.text}</p>
            <footer>
              <button class="plain" @click=${() => (this.confirm = undefined)}>
                Cancel</button
              ><button class="danger" @click=${this.accept}>
                Delete permanently
              </button>
            </footer>
          </section>
        </div>`
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
