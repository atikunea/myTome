import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import { imageFrom, imageUrl, store } from "../services/store";

@customElement("element-list-page")
export class ElementListPage extends LitElement {
  @property() tomeId = "";
  @property({ attribute: false }) type?: ElementType;
  @property({ attribute: false }) elements: Element[] = [];
  @property() editId?: string;
  @property({ type: Boolean }) fresh = false;
  @state() private query = "";
  @state() private sort = "recent";
  @state() private list = false;
  @state() private error = "";
  private navigate(path = "") {
    if (this.type)
      location.hash = `/tomes/${this.tomeId}/elements/${this.type.id}${path}`;
  }
  private confirm(text: string, action: () => Promise<void>) {
    this.dispatchEvent(
      new CustomEvent("request-confirm", {
        detail: { text, action },
        bubbles: true,
        composed: true,
      }),
    );
  }
  private get items() {
    const needle = this.query.toLowerCase();
    return [...this.elements]
      .filter((item) =>
        `${item.name} ${item.description}`.toLowerCase().includes(needle),
      )
      .sort((a, b) =>
        this.sort === "name"
          ? a.name.localeCompare(b.name)
          : b.updatedAt.localeCompare(a.updatedAt),
      );
  }
  private async submit(event: SubmitEvent) {
    event.preventDefault();
    if (!this.type) return;
    try {
      const form = event.currentTarget as HTMLFormElement;
      const editing = this.editId
        ? this.elements.find((item) => item.id === this.editId)
        : undefined;
      const values = new FormData(form);
      const attributes: Record<string, string> = {};
      this.type.fieldDefinitions.forEach(
        (field) =>
          (attributes[field.id] = String(values.get(`attr-${field.id}`) ?? "")),
      );
      const image = await imageFrom(
        String(values.get("imageUrl") ?? ""),
        (form.elements.namedItem("imageFile") as HTMLInputElement).files?.[0],
      );
      await store.saveElement({
        id: editing?.id,
        tomeId: this.tomeId,
        elementTypeId: this.type.id,
        name: String(values.get("name") ?? ""),
        description: String(values.get("description") ?? ""),
        attributes,
        image: image ?? editing?.image,
      });
      this.navigate();
    } catch (cause) {
      this.error =
        cause instanceof Error ? cause.message : "Could not save element.";
    }
  }
  render() {
    if (!this.type)
      return html`<section class="empty">
        <h2>Element type not found</h2>
      </section>`;
    const editing = this.editId
      ? this.elements.find((item) => item.id === this.editId)
      : undefined;
    return this.fresh || editing ? this.editor(editing) : this.listView();
  }
  private listView() {
    const type = this.type!;
    return html`<section>
      <header>
        <div>
          <p class="eyebrow">${type.name.toUpperCase()}S</p>
          <h2>${type.name}s</h2>
        </div>
        <button @click=${() => this.navigate("/new")}>
          + New ${type.name}
        </button>
      </header>
      <div class="toolbar">
        <input
          placeholder="Search ${type.name.toLowerCase()}s…"
          @input=${(event: InputEvent) =>
            (this.query = (event.target as HTMLInputElement).value)}
        /><select
          @change=${(event: Event) =>
            (this.sort = (event.target as HTMLSelectElement).value)}
        >
          <option value="recent">Recently updated</option>
          <option value="name">Name</option></select
        ><button class="plain" @click=${() => (this.list = !this.list)}>
          ${this.list ? "Grid view" : "List view"}
        </button>
      </div>
      <div class=${this.list ? "list" : "cards"}>
        ${this.items.map(
          (item) =>
            html`<article class="card">
              ${this.cover(item)}
              <div>
                <h3>${item.name}</h3>
                <p>${item.description || "No description yet."}</p>
                ${type.fieldDefinitions
                  .filter((field) => item.attributes[field.id])
                  .slice(0, 2)
                  .map(
                    (field) =>
                      html`<small
                        >${field.name}: ${item.attributes[field.id]}</small
                      >`,
                  )}
                <footer>
                  <button
                    class="plain"
                    @click=${() => this.navigate(`/${item.id}/edit`)}
                  >
                    Edit</button
                  ><button
                    class="danger plain"
                    @click=${() =>
                      this.confirm(
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
      </div>
      ${!this.items.length
        ? html`<div class="empty">
            <h2>No ${type.name.toLowerCase()}s yet</h2>
            <p>Create one to begin filling out this world.</p>
          </div>`
        : nothing}
    </section>`;
  }
  private editor(item?: Element) {
    const type = this.type!;
    return html`<form @submit=${this.submit}>
      <header>
        <h2>${item ? `Edit ${item.name}` : `New ${type.name}`}</h2>
        <button type="button" class="plain" @click=${() => this.navigate()}>
          Cancel
        </button>
      </header>
      ${this.error ? html`<p class="error">${this.error}</p>` : nothing}<label
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
                    (option) =>
                      html`<option
                        value=${option}
                        ?selected=${item?.attributes[field.id] === option}
                      >
                        ${option}
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
  private cover(item: Element) {
    const url = imageUrl(item.image);
    return url
      ? html`<img class="cover" src=${url} alt="${item.name}" />`
      : html`<div class="cover fallback">
          ${item.name.slice(0, 1).toUpperCase()}
        </div>`;
  }
  static styles = css`
    :host {
      display: block;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 25px;
    }
    h2,
    h3,
    p {
      margin: 0;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.12em;
    }
    button {
      border: 0;
      border-radius: 9px;
      padding: 11px 15px;
      background: var(--accent);
      color: #fff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .plain {
      background: transparent;
      color: var(--ink);
    }
    .danger {
      background: #b63b3b;
      color: #fff;
    }
    .toolbar {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 28px;
    }
    input,
    select,
    textarea {
      box-sizing: border-box;
      width: 100%;
      margin-top: 5px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font: inherit;
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
    .card {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
    }
    .cover {
      display: block;
      width: 100%;
      height: 142px;
      object-fit: cover;
      background: #eee;
    }
    .fallback {
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #d7b799, #8e6048);
      color: #fff;
      font: 3rem Georgia;
    }
    .card > div {
      padding: 17px;
    }
    .card p {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .card small {
      display: block;
      color: var(--muted);
    }
    footer {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      margin-top: 14px;
    }
    .list {
      display: grid;
      gap: 10px;
    }
    .list .card {
      display: flex;
    }
    .list .cover {
      width: 110px;
      height: auto;
    }
    .list .card > div {
      flex: 1;
    }
    .empty {
      padding: 44px;
      border: 1px dashed var(--line);
      border-radius: 14px;
      color: var(--muted);
      text-align: center;
    }
    .error {
      padding: 10px;
      border-radius: 8px;
      background: #ffe1e1;
      color: #8f2020;
    }
    label {
      display: block;
      margin: 14px 0;
      font-size: 0.9rem;
      font-weight: 700;
    }
    textarea {
      min-height: 90px;
    }
    @media (max-width: 700px) {
      header {
        align-items: flex-start;
        flex-direction: column;
      }
      .list .card {
        display: block;
      }
      .list .cover {
        width: 100%;
        height: 120px;
      }
    }
  `;
}
