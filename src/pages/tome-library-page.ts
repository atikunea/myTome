import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Tome } from "../models/Tome";
import { imageUrl } from "../services/store";

@customElement("tome-library-page")
export class TomeLibraryPage extends LitElement {
  @property({ attribute: false }) tomes: Tome[] = [];
  @state() private query = "";
  @state() private status = "All";

  private notify(name: string, detail?: Tome) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }

  private get filteredTomes() {
    const needle = this.query.toLowerCase();
    return this.tomes.filter(
      (tome) =>
        (this.status === "All" || tome.status === this.status) &&
        `${tome.title} ${tome.subtitle ?? ""}`.toLowerCase().includes(needle),
    );
  }

  render() {
    return html`<main>
      <header>
        <div>
          <p class="eyebrow">MY TOME</p>
          <h1>Your story library</h1>
          <p class="muted">A quiet place to keep every world together.</p>
        </div>
        <button @click=${() => this.notify("create-tome")}>+ New tome</button>
      </header>
      <section class="toolbar">
        <input
          aria-label="Search tomes"
          placeholder="Search by title…"
          .value=${this.query}
          @input=${(event: InputEvent) =>
            (this.query = (event.target as HTMLInputElement).value)}
        />
        <select
          aria-label="Filter status"
          @change=${(event: Event) =>
            (this.status = (event.target as HTMLSelectElement).value)}
        >
          <option>All</option>
          <option>Draft</option>
          <option>Completed</option>
          <option>Archived</option>
        </select>
      </section>
      <section class="cards">
        ${this.filteredTomes.map(
          (tome) =>
            html`<article class="card">
              ${this.cover(tome)}
              <div class="card-body">
                <span class="badge ${tome.status.toLowerCase()}"
                  >${tome.status}</span
                >
                <h2>${tome.title}</h2>
                <p>
                  ${tome.subtitle || tome.description || "No description yet."}
                </p>
                <footer>
                  <button
                    class="plain"
                    @click=${() => this.notify("open-tome", tome)}
                  >
                    Open
                  </button>
                  <button
                    class="plain"
                    @click=${() => this.notify("edit-tome", tome)}
                  >
                    Edit
                  </button>
                  <button
                    class="danger plain"
                    @click=${() => this.notify("delete-tome", tome)}
                  >
                    Delete
                  </button>
                </footer>
              </div>
            </article>`,
        )}
      </section>
      ${!this.filteredTomes.length
        ? html`<div class="empty">
            <h2>No tomes found</h2>
            <p>Create a tome to start shaping a new story.</p>
          </div>`
        : nothing}
    </main>`;
  }

  private cover(tome: Tome) {
    const url = imageUrl(tome.coverImage);
    return url
      ? html`<img class="cover" src=${url} alt="${tome.title} cover" />`
      : html`<div class="cover fallback" aria-hidden="true">
          ${tome.title.slice(0, 1).toUpperCase()}
        </div>`;
  }

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      padding: 48px clamp(20px, 5vw, 76px);
      background: var(--paper);
      box-sizing: border-box;
    }
    h1,
    h2,
    p {
      margin: 0;
    }
    h1 {
      font-size: clamp(2rem, 5vw, 3.4rem);
      letter-spacing: -0.05em;
    }
    h2 {
      font-size: 1.35rem;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 36px;
    }
    .muted,
    .card p {
      color: var(--muted);
    }
    .muted {
      margin-top: 10px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.12em;
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
    button.plain {
      padding: 8px;
      background: transparent;
      color: var(--ink);
    }
    .danger {
      color: white !important;
      background: #b63b3b !important;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 28px;
    }
    input,
    select {
      width: auto;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font: inherit;
    }
    input {
      flex: 1;
      min-width: 180px;
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
      background: white;
      box-shadow: 0 3px 14px #281b1609;
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
      color: white;
      font: 3rem Georgia;
    }
    .card-body {
      padding: 17px;
    }
    .card h2 {
      margin: 9px 0;
    }
    .card p {
      font-size: 0.92rem;
      line-height: 1.45;
    }
    footer {
      display: flex;
      gap: 5px;
      margin-top: 14px;
    }
    .badge {
      padding: 4px 7px;
      border-radius: 99px;
      background: #eee;
      font-size: 0.68rem;
      font-weight: 800;
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
    .empty {
      margin-top: 18px;
      padding: 44px;
      border: 1px dashed var(--line);
      border-radius: 14px;
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 700px) {
      :host {
        padding: 27px 18px;
      }
      header {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `;
}
