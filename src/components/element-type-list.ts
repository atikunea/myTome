import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { db } from '../models/db';

@customElement('element-type-list')
export class ElementTypeList extends LitElement {

  @property()
  loading = true;
  
  async connect() {
    await this.populate();
  }

  private async populate() {
    try {
      const types = await db.ElementTypes.getAll();
      this.loading = false;
    } catch (e) {
      console.error('Failed to load element types:', e);
      this.loading = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">Loading...</div>`;
    }

    return html`
      <div class="element-type-list">
        ${this.getTypes().map(t => `
          <div class="type-card" data-id="${t.id}">
            <span class="type-name">${t.name}</span>
            <p class="type-description">${t.description}</p>
          </div>
        `).join('')}
      </div>`;
  }

  static get css() {
    return css`
      .element-type-list {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        padding: 16px;
        background: #f5f7fa;
        border-radius: 8px;
        margin-bottom: 20px;
      }

      .type-card {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: white;
        border-radius: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        min-width: 180px;
      }

      .type-name {
        font-weight: 600;
        color: #1a202c;
        white-space: nowrap;
        flex: 1;
      }

      .type-description {
        font-size: 13px;
        color: #4a5568;
        line-height: 1.4;
      }

      .loading {
        padding: 20px;
        text-align: center;
        color: #4a5568;
        font-style: italic;
      }
    `;
  }
}

