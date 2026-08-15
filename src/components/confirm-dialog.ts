import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("confirm-dialog")
export class ConfirmDialog extends LitElement {
  @property() message = "";

  private dismiss() {
    this.dispatchEvent(new Event("cancel"));
  }
  private confirm() {
    this.dispatchEvent(new Event("confirm"));
  }

  render() {
    return html`<div class="backdrop">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm deletion"
      >
        <h2>Are you sure?</h2>
        <p>${this.message}</p>
        <footer>
          <button class="plain" @click=${this.dismiss}>Cancel</button>
          <button class="danger" @click=${this.confirm}>
            Delete permanently
          </button>
        </footer>
      </section>
    </div>`;
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 5;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 20px;
      background: #21150b77;
    }
    section {
      width: min(430px, 100%);
      padding: 26px;
      border-radius: 15px;
      background: white;
      box-shadow: 0 18px 60px #0004;
    }
    h2,
    p {
      margin: 0;
    }
    p {
      margin-top: 12px;
      line-height: 1.45;
    }
    footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 22px;
    }
    button {
      padding: 11px 15px;
      border: 0;
      border-radius: 9px;
      background: var(--accent);
      color: white;
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
    }
  `;
}
