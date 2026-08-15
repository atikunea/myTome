import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { FieldDefinition, FieldKind } from "../models/ElementType";

@customElement("field-definitions-editor")
export class FieldDefinitionsEditor extends LitElement {
  @property({ attribute: false }) fields: FieldDefinition[] = [];
  @state() private working: FieldDefinition[] = this.fields;

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("fields") && this.fields !== this.working) {
      this.working = this.fields;
    }
  }
  private emitChange(fields: FieldDefinition[]) {
    this.working = fields;
    this.dispatchEvent(
      new CustomEvent<FieldDefinition[]>("fields-change", {
        detail: fields,
        bubbles: true,
        composed: true,
      }),
    );
  }
  private update_(id: string, patch: Partial<FieldDefinition>) {
    this.emitChange(
      this.working.map((field) =>
        field.id === id ? { ...field, ...patch } : field,
      ),
    );
  }
  private addField() {
    this.emitChange([
      ...this.working,
      {
        id: crypto.randomUUID(),
        name: "",
        kind: "text",
        options: [],
        required: false,
        sortOrder: this.working.length,
      },
    ]);
  }
  private removeField(id: string) {
    this.dispatchEvent(
      new CustomEvent<string>("field-remove", {
        detail: id,
        bubbles: true,
        composed: true,
      }),
    );
  }
  render() {
    return html`<div class="field-title">
        <h3>Custom fields</h3>
        <button type="button" class="plain" @click=${this.addField}>
          + Add field
        </button>
      </div>
      <div class="field-list">
        ${this.working.map((field) => this.row(field))}
        ${!this.working.length
          ? html`<p class="muted empty">No custom fields yet.</p>`
          : nothing}
      </div>
      ${this.working.length
        ? html`<p class="muted">
            For configurable lists, enter choices separated by commas.
          </p>`
        : nothing}`;
  }
  private row(field: FieldDefinition) {
    return html`<div class="field">
      <input
        class="name"
        placeholder="Field name"
        .value=${field.name}
        @input=${(event: Event) =>
          this.update_(field.id, {
            name: (event.target as HTMLInputElement).value,
          })}
      />
      <select
        class="kind"
        .value=${field.kind}
        @change=${(event: Event) =>
          this.update_(field.id, {
            kind: (event.target as HTMLSelectElement).value as FieldKind,
          })}
      >
        <option value="text">Text</option>
        <option value="select">List</option>
      </select>
      ${field.kind === "select"
        ? html`<input
            class="options"
            placeholder="Choices, separated by commas"
            .value=${(field.options ?? []).join(", ")}
            @input=${(event: Event) =>
              this.update_(field.id, {
                options: (event.target as HTMLInputElement).value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })}
          />`
        : nothing}
      <label class="required">
        <input
          type="checkbox"
          .checked=${field.required}
          @change=${(event: Event) =>
            this.update_(field.id, {
              required: (event.target as HTMLInputElement).checked,
            })}
        />
        Required
      </label>
      <button
        type="button"
        class="remove"
        aria-label="Remove field"
        title="Remove field"
        @click=${() => this.removeField(field.id)}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path
            d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
          />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </div>`;
  }
  static styles = css`
    :host {
      display: block;
    }
    h3,
    p {
      margin: 0;
    }
    .field-title {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      margin-bottom: 16px;
    }
    .muted {
      color: var(--muted);
    }
    .empty {
      padding: 14px 0;
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
    input,
    select {
      box-sizing: border-box;
      width: 100%;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font: inherit;
    }
    .field-list {
      display: flex;
      flex-direction: column;
    }
    .field {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
    }
    .field .name {
      flex: 1 1 180px;
      min-width: 0;
    }
    .field .kind {
      flex: 0 1 170px;
      min-width: 0;
    }
    .field .options {
      flex: 1 1 220px;
      min-width: 0;
    }
    .field .required {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
      margin: 0;
      font-size: 0.9rem;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
    }
    .field .required input {
      width: auto;
    }
    .field .remove {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      padding: 8px;
      background: transparent;
      color: #b63b3b;
    }
    .field .remove:hover {
      background: #b63b3b1a;
    }
    @media (max-width: 700px) {
      .field {
        flex-direction: column;
        align-items: stretch;
      }
      .field .name,
      .field .kind,
      .field .options,
      .field .required {
        flex: 1 1 auto;
        width: 100%;
      }
      .field .remove {
        align-self: flex-end;
      }
    }
  `;
}
