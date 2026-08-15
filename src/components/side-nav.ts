import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ElementType } from "../models/ElementType";
import type { Tome } from "../models/Tome";

@customElement("side-nav")
export class SideNav extends LitElement {
  @property({ attribute: false }) tome?: Tome;
  @property({ attribute: false }) types: ElementType[] = [];
  @property() page = "";
  @property() typeId?: string;

  render() {
    if (!this.tome) return html``;

    return html`<aside>
      <a class="brand" href="#/tomes">myTome</a>
      <p class="nav-label">${this.tome.title}</p>
      <a
        href=${`#/tomes/${this.tome.id}/dashboard`}
        class=${this.page === "tome" ? "active" : ""}
      >
        Overview
      </a>
      <p class="nav-label">ELEMENTS</p>
      ${this.types.map(
        (type) =>
          html`<a
            href=${`#/tomes/${this.tome!.id}/elements/${type.id}`}
            class=${this.typeId === type.id ? "active" : ""}
          >
            ${type.name}
          </a>`,
      )}
      <a
        href=${`#/tomes/${this.tome.id}/elements/settings`}
        class=${this.page === "types" ? "active" : ""}
      >
        ⚙ Manage Elements
      </a>
    </aside>`;
  }

  static styles = css`
    :host {
      display: block;
      background: #27201c;
      color: #eee;
    }
    aside {
      min-height: 100%;
      padding: 31px 20px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .brand {
      margin-bottom: 36px;
      color: #fff;
      font: 1.7rem Georgia;
      text-decoration: none;
    }
    .nav-label {
      margin: 18px 9px 5px;
      color: #bfa998;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.12em;
    }
    a:not(.brand) {
      padding: 9px;
      color: #dfd7d1;
      border-radius: 7px;
      text-decoration: none;
    }
    a.active,
    a:not(.brand):hover {
      background: #44372f;
      color: #fff;
    }
    @media (max-width: 700px) {
      aside {
        min-height: auto;
        padding: 14px;
        flex-direction: row;
        align-items: center;
        overflow: auto;
        white-space: nowrap;
      }
      .brand {
        margin: 0 12px 0 0;
        font-size: 1.25rem;
      }
      .nav-label {
        display: none;
      }
      a:not(.brand) {
        padding: 7px;
      }
    }
  `;
}
