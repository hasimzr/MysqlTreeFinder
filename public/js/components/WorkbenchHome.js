/**
 * MySQL Tree Schema Finder - Workbench Connections Landing Component
 */

import { state } from '../state.js';
import { escapeHtml, refreshIcons } from '../utils.js';
import { addOrUpdateConnection, deleteConnection, attemptConnection } from '../services/apiService.js';

export async function showWorkbenchHome(callbacks = {}) {
  const elements = {
    workspace: document.getElementById('main-workspace'),
    modal: document.getElementById('connection-modal'),
    connectionBar: document.getElementById('active-connection-bar'),
    workbenchHome: document.getElementById('workbench-home')
  };

  if (elements.workspace) elements.workspace.classList.add('hidden');
  if (elements.modal) elements.modal.classList.add('hidden');
  if (elements.connectionBar) elements.connectionBar.classList.add('hidden');
  if (elements.workbenchHome) elements.workbenchHome.classList.remove('hidden');

  renderSavedConnections('', callbacks);
  refreshIcons();
}

export function renderSavedConnections(filterQuery = '', callbacks = {}) {
  const grid = document.getElementById('saved-connections-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const { showModal, showPasswordPromptModal, attemptConnectionCb } = callbacks;

  const query = filterQuery.toLowerCase().trim();
  const filtered = state.savedConnections.filter(c => {
    if (!query) return true;
    const searchStr = `${c.title || ''} ${c.host} ${c.user} ${c.database || ''}`.toLowerCase();
    return searchStr.includes(query);
  });

  filtered.forEach(conn => {
    const card = document.createElement('div');
    card.className = 'connection-card';

    const titleStr = conn.title || `${conn.user}@${conn.host}`;
    const subStr = `${conn.user}@${conn.host}:${conn.port}`;
    const isLocal = conn.host === 'localhost' || conn.host === '127.0.0.1';

    card.innerHTML = `
      <div class="conn-card-header">
        <div class="conn-card-icon-wrapper ${conn.isMock ? 'mock' : ''}">
          <i data-lucide="database" width="22" height="22"></i>
        </div>
        <div class="conn-card-info">
          <h3 class="conn-card-title">${escapeHtml(titleStr)}</h3>
          <p class="conn-card-subtitle">${escapeHtml(subStr)}</p>
        </div>
        <div class="conn-card-actions-top">
          <button type="button" class="conn-action-btn edit-conn-btn" title="Düzenle">
            <i data-lucide="edit-3" width="14" height="14"></i>
          </button>
          <button type="button" class="conn-action-btn delete delete-conn-btn" title="Sil">
            <i data-lucide="trash-2" width="14" height="14"></i>
          </button>
        </div>
      </div>

      <div class="conn-card-details">
        <div class="conn-detail-item">
          <i data-lucide="folder-tree" width="14" height="14"></i>
          <span>Varsayılan Şema: <strong>${escapeHtml(conn.database || 'Tüm Şemalar')}</strong></span>
        </div>
      </div>

      <div class="conn-card-footer">
        <div class="conn-badges">
          ${conn.isMock
            ? '<span class="conn-badge badge-demo">DEMO</span>'
            : isLocal
              ? '<span class="conn-badge badge-local">LOCAL</span>'
              : '<span class="conn-badge badge-local">REMOTE</span>'}
          ${conn.ssl ? '<span class="conn-badge badge-ssl">SSL</span>' : ''}
          ${conn.askPassword ? '<span class="conn-badge badge-ask" title="Diskte şifre tutulmaz, her bağlantıda sorulur"><i data-lucide="shield-alert" width="12" height="12"></i> ŞİFRE SOR</span>' : ''}
        </div>
        <span class="conn-connect-link">
          Bağlan <i data-lucide="chevron-right" width="16" height="16"></i>
        </span>
      </div>
    `;

    // Card click -> Connect or Open Password Prompt Modal
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.conn-action-btn')) return;
      if (conn.askPassword || (!conn.password && !conn.isMock)) {
        if (typeof showPasswordPromptModal === 'function') {
          showPasswordPromptModal(conn);
        }
      } else {
        conn.lastUsed = Date.now();
        addOrUpdateConnection(conn, () => renderSavedConnections(filterQuery, callbacks));
        if (typeof attemptConnectionCb === 'function') {
          await attemptConnectionCb(conn);
        } else {
          await attemptConnection(conn);
        }
      }
    });

    // Edit button click
    const btnEdit = card.querySelector('.edit-conn-btn');
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof showModal === 'function') {
        showModal(conn);
      }
    });

    // Delete button click
    const btnDelete = card.querySelector('.delete-conn-btn');
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`"${titleStr}" bağlantısını silmek istediğinize emin misiniz?`)) {
        deleteConnection(conn.id, () => renderSavedConnections(filterQuery, callbacks));
      }
    });

    grid.appendChild(card);
  });

  // Append "+ Yeni Bağlantı Ekle" tile card
  const addCard = document.createElement('div');
  addCard.className = 'add-connection-card';
  addCard.innerHTML = `
    <div class="add-card-icon">
      <i data-lucide="plus" width="24" height="24"></i>
    </div>
    <span class="add-card-title">Yeni Bağlantı Ekle</span>
    <span class="add-card-sub">Yeni bir MySQL veritabanı sunucusu tanımlayın</span>
  `;

  addCard.addEventListener('click', () => {
    if (typeof showModal === 'function') {
      showModal();
    }
  });

  grid.appendChild(addCard);
  refreshIcons();
}
