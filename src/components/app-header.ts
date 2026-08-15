import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Tome } from "../models/Tome";

@customElement("app-header")
export class AppHeader extends LitElement {
  @property({ attribute: false }) tome?: Tome;

  render() {
    if (!this.tome) return html``;
    return html`<header>
      <div>
        <a href="#/tomes">← Library</a>
        <h1>${this.tome.title}</h1>
      </div>
      <a class="edit" href=${`#/tomes/${this.tome.id}/edit`}>Edit tome</a>
    </header>`;
  }

  static styles = css`
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 25px;
      margin-bottom: 40px;
      border-bottom: 1px solid var(--line);
    }
    a {
      display: block;
      margin-bottom: 9px;
      color: var(--muted);
      font-size: 0.85rem;
      text-decoration: none;
    }
    h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 3.4rem);
      letter-spacing: -0.05em;
    }
    .edit {
      margin: 0;
      padding: 8px;
      color: var(--ink);
      font-weight: 700;
    }
    @media (max-width: 700px) {
      header {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `;
}
