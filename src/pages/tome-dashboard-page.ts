import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Tome } from "../models/Tome";

@customElement("tome-dashboard-page")
export class TomeDashboardPage extends LitElement {
  @property({ attribute: false }) tome?: Tome;

  render() {
    if (!this.tome) return html``;
    return html`<section>
      <p class="eyebrow">TOME OVERVIEW</p>
      <h2>${this.tome.subtitle || "A home for your story"}</h2>
      <p class="description">
        ${this.tome.description ||
        "Add a description to give this tome its north star."}
      </p>
      <div>
        Use the Elements navigation to define the people, places, ideas, and
        events in this world.
      </div>
    </section>`;
  }

  static styles = css`
    section {
      max-width: 680px;
    }
    h2 {
      margin: 10px 0;
      font-size: 1.7rem;
    }
    p {
      margin: 0;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.12em;
    }
    .description {
      color: var(--muted);
      line-height: 1.6;
    }
    div {
      margin-top: 28px;
      padding: 18px;
      border-radius: 11px;
      background: #fbf3e7;
      line-height: 1.45;
    }
  `;
}
