import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ElementType } from "../models/ElementType";
import { store } from "../services/store";

@customElement("element-types-page")
export class ElementTypesPage extends LitElement {
  @property() tomeId = "";
  @property({ attribute: false }) types: ElementType[] = [];
  @property() editId?: string;
  @property({ type: Boolean }) fresh = false;
  @state() private error = "";

  private get editing() {
    return this.editId
      ? this.types.find((type) => type.id === this.editId)
      : undefined;
  }
  private navigate(path = "") {
    location.hash = `/tomes/${this.tomeId}/elements/settings${path}`;
  }
  private requestConfirmation(text: string, action: () => Promise<void>) {
    this.dispatchEvent(
      new CustomEvent("request-confirm", {
        detail: { text, action },
        bubbles: true,
        composed: true,
      }),
    );
  }
  private async submit(event: SubmitEvent) {
    event.preventDefault();
    try {
      const form = event.currentTarget as HTMLFormElement;
      const existing = this.editing;
      const fields = [
        ...form.querySelectorAll<HTMLElement>("[data-field]"),
      ].map((row, sortOrder) => ({
        id: row.dataset.id || crypto.randomUUID(),
        name: (row.querySelector('[name="field-name"]') as HTMLInputElement)
          .value,
        kind: (row.querySelector('[name="field-kind"]') as HTMLSelectElement)
          .value as "text" | "select",
        options: (
          row.querySelector('[name="field-options"]') as HTMLInputElement
        ).value
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        required: (
          row.querySelector('[name="field-required"]') as HTMLInputElement
        ).checked,
        sortOrder,
      }));
      await store.saveType({
        id: existing?.id,
        tomeId: this.tomeId,
        name: String(new FormData(form).get("name") ?? ""),
        description: String(new FormData(form).get("description") ?? ""),
        fieldDefinitions: fields,
      });
      this.navigate();
    } catch (cause) {
      this.error =
        cause instanceof Error ? cause.message : "Could not save element type.";
    }
  }
  private addField() {
    const list = this.renderRoot.querySelector("#field-list");
    list?.insertAdjacentHTML(
      "beforeend",
      `<div class="field" data-field><input name="field-name" placeholder="Field name"><select name="field-kind"><option value="text">Text</option><option value="select">Configurable list</option></select><label><input name="field-required" type="checkbox"> Required</label><input name="field-options" placeholder="Choices, separated by commas"><button type="button" class="remove">Remove</button></div>`,
    );
  }
  private async fieldAction(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("remove")) return;
    const row = target.closest<HTMLElement>("[data-field]");
    const id = row?.dataset.id;
    const type = this.editing;
    if (!row) return;
    if (!id || !type) {
      row.remove();
      return;
    }
    const field = type.fieldDefinitions.find(
      (definition) => definition.id === id,
    );
    const count = await store.countField(type.id, id);
    this.requestConfirmation(
      `Remove “${field?.name ?? "this field"}”? ${count} stored value${count === 1 ? "" : "s"} will be permanently deleted.`,
      async () => {
        await store.deleteField(type, id);
        row.remove();
      },
    );
  }
  private async deleteType(type: ElementType) {
    const count = await store.countElements(type.id);
    this.requestConfirmation(
      `Permanently delete “${type.name}” and all ${count} of its elements? This cannot be undone.`,
      async () => {
        await store.deleteType(type);
        this.navigate();
      },
    );
  }
  render() {
    const type = this.editing;
    if (this.fresh || type) return this.editor(type);
    return html`<section>
      <header>
        <div>
          <p class="eyebrow">ELEMENT CONFIGURATION</p>
          <h2>Element types</h2>
          <p class="muted">Define the building blocks for this tome.</p>
        </div>
        <button @click=${() => this.navigate("/new")}>+ New type</button>
      </header>
      <div class="type-list">
        ${this.types.map(
          (item) =>
            html`<article>
              <h3>${item.name}</h3>
              <p>${item.description || "No description"}</p>
              <small
                >${item.fieldDefinitions.length} custom
                field${item.fieldDefinitions.length === 1 ? "" : "s"}</small
              >
              <footer>
                <button
                  class="plain"
                  @click=${() => this.navigate(`/${item.id}`)}
                >
                  Configure</button
                ><button
                  class="danger plain"
                  @click=${() => this.deleteType(item)}
                >
                  Delete
                </button>
              </footer>
            </article>`,
        )}
      </div>
    </section>`;
  }
  private editor(type?: ElementType) {
    const fields = type?.fieldDefinitions ?? [];
    return html`<form @submit=${this.submit} @click=${this.fieldAction}>
      <header>
        <h2>${type ? `Configure ${type.name}` : "New element type"}</h2>
        <button class="plain" type="button" @click=${() => this.navigate()}>
          Cancel
        </button>
      </header>
      ${this.error ? html`<p class="error">${this.error}</p>` : nothing}<label
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
          (field) =>
            html`<div class="field" data-field data-id=${field.id}>
              <input
                name="field-name"
                placeholder="Field name"
                .value=${field.name}
              />
              <select name="field-kind" .value=${field.kind}>
                <option value="text">Text</option>
                <option value="select">List</option>
              </select>
              ${field.kind === "select" ?
                html`<input
                name="field-options"
                placeholder="Choices, separated by commas"
                .value=${(field.options ?? []).join(", ")} />`
              : nothing }
              <label>Required</label>
              <input
                name="field-required"
                type="checkbox"
                .checked=${field.required}
              />
              <button type="button" class="remove">Remove</button>
            </div>`,
        )}
      </div>
      <p class="muted">
        For configurable lists, enter choices separated by commas.
      </p>
      <footer><button>Save type</button></footer>
    </form>`;
  }
  static styles = css`
    :host {
      display: block;
    }
    header,
    .field-title {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
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
    .muted,
    small {
      color: var(--muted);
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
    .type-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 15px;
    }
    .type-list article {
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
    }
    .type-list p {
      margin: 8px 0;
      color: var(--muted);
    }
    footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 22px;
    }
    label {
      display: block;
      margin: 14px 0;
      font-size: 0.9rem;
      font-weight: 700;
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
    textarea {
      min-height: 90px;
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
      margin: 0;
      white-space: nowrap;
    }
    .field input,
    .field select {
      margin: 0;
    }
    .error {
      padding: 10px;
      border-radius: 8px;
      background: #ffe1e1;
      color: #8f2020;
    }
    @media (max-width: 700px) {
      header {
        align-items: flex-start;
        flex-direction: column;
      }
      .field {
        grid-template-columns: 1fr 1fr;
      }
      .field [name="field-options"] {
        grid-column: 1/-1;
      }
    }
  `;
}
