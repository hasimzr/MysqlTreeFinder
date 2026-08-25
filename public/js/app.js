/**
 * MySQL Tree Schema Finder - Main Application Entry Point
 */

import { state } from './state.js';
import { refreshIcons, makeTableResizable, setupTableShiftScroll } from './utils.js';
import { loadSavedConnections, attemptConnection, loadSchemaTree } from './services/apiService.js';
import { showWorkbenchHome, renderSavedConnections } from './components/WorkbenchHome.js';
import { showModal, hideModal, showPasswordPromptModal, hidePasswordPromptModal, setupModalEvents, setLoadingState, showError, hideError } from './components/ConnectionModal.js';
import { renderTreeView, setupSchemaTreeEvents, highlightSidebarTable } from './components/SchemaTree.js';
import { openTableDetail, showWelcomeState, setupTableDetailEvents } from './components/TableDetail.js';
import { initSqlQueryConsole } from './components/SqlQueryConsole.js';
import { initCellEditor } from './components/CellEditor.js';
import { parseHash, updateHash, pushHash, onHashChange, restoreFromHash, resumePendingRoute } from './router.js';

document.addEventListener('DOMContentLoaded', async () => {
  initSqlQueryConsole();
  initCellEditor();

  // ── Load saved connections first (needed for hash restore) ──────────────────
  await loadSavedConnections();

  // Common callbacks object to decouple components
  const callbacks = {
    showModal: (conn) => showModal(conn),
    hideModal: () => hideModal(),
    showPasswordPromptModal: (conn) => showPasswordPromptModal(conn),
    hidePasswordPromptModal: () => hidePasswordPromptModal(),
    renderConnectionsCb: (filterQuery = '') => renderSavedConnections(filterQuery, callbacks),

    attemptConnectionCb: async (creds) => {
      const success = await attemptConnection(creds, {
        setLoadingState,
        showError,
        hideError,
        populateSchemaSelector,
        showWorkspace,
        renderTree: () => renderTreeView(callbacks.onSelectTable),
        showWelcome: () => showWelcomeState()
      });

      // After successful connection, update hash with connId + schema
      if (success && creds.id) {
        pushHash({
          connId: creds.id,
          schema: state.currentSchema || undefined
        });

        // If there's a pending route (user came from a deep link with password), resume it
        if (state._pendingRouteParams) {
          await resumePendingRoute(callbacks);
        }
      }

      return success;
    },

    onSelectTable: (table) => {
      openTableDetail(table, {}, callbacks);
    },

    highlightSidebarTable: (tableName) => {
      highlightSidebarTable(tableName);
    }
  };

  // 1. UI Navigation & Top Header Actions
  const btnWorkbenchHome = document.getElementById('btn-workbench-home');
  const brandLogoBtn = document.getElementById('brand-logo-btn');
  const btnReconnect = document.getElementById('btn-reconnect');
  const connSearchInput = document.getElementById('conn-search-input');
  const btnAddNewConn = document.getElementById('btn-add-new-conn');
  const schemaSelect = document.getElementById('schema-select');

  if (btnWorkbenchHome) {
    btnWorkbenchHome.addEventListener('click', () => {
      pushHash({});          // clear hash → home
      showWorkbenchHome(callbacks);
    });
  }

  if (brandLogoBtn) {
    brandLogoBtn.addEventListener('click', () => {
      pushHash({});
      showWorkbenchHome(callbacks);
    });
  }

  if (btnReconnect) {
    btnReconnect.addEventListener('click', () => showModal(state.credentials));
  }

  if (btnAddNewConn) {
    btnAddNewConn.addEventListener('click', () => showModal());
  }

  if (connSearchInput) {
    connSearchInput.addEventListener('input', (e) => renderSavedConnections(e.target.value, callbacks));
  }

  if (schemaSelect) {
    schemaSelect.addEventListener('change', async (e) => {
      const selected = e.target.value;
      if (selected) {
        await loadSchemaTree(selected, {
          renderTree: () => renderTreeView(callbacks.onSelectTable),
          showWelcome: () => showWelcomeState()
        });
        // Update hash: keep connId, change schema, clear table & tab
        updateHash({ schema: selected, table: undefined, tab: undefined });
      }
    });
  }

  // 2. Setup Modals, Schema Tree & Table Details Event Listeners
  setupModalEvents(callbacks);
  setupSchemaTreeEvents(callbacks.onSelectTable);
  setupTableDetailEvents(callbacks);

  // Initialize resizers & shift-scroll for initial static tables
  document.querySelectorAll('.data-table').forEach(makeTableResizable);
  document.querySelectorAll('.table-wrapper').forEach(setupTableShiftScroll);

  // 3. Listen for browser back/forward navigation
  onHashChange(async (params) => {
    if (!params.connId) {
      showWorkbenchHome(callbacks);
      return;
    }
    // If we're already connected to the same schema, just open the table
    if (params.table && state.treeData && state.currentSchema === params.schema) {
      const tableObj = state.treeData.tables.find(t => t.name === params.table)
        || { name: params.table, type: 'TABLE', columns: [] };
      highlightSidebarTable(params.table);
      await openTableDetail(tableObj, { skipHashUpdate: true }, callbacks);
      if (params.tab) {
        const { activateTab } = await import('./router.js');
        activateTab(params.tab);
      }
    }
  });

  // 4. Boot Application — try to restore from URL hash first
  const { restored } = await restoreFromHash(callbacks);
  if (!restored) {
    // No hash or unknown connection → show home screen
    showWorkbenchHome(callbacks);
  }
});

/**
 * Populate Schema Selector Dropdown
 */
function populateSchemaSelector() {
  const schemaSelect = document.getElementById('schema-select');
  const hostBadge = document.getElementById('connection-host-badge');

  if (hostBadge && state.credentials) {
    hostBadge.textContent = state.credentials.isMock
      ? 'Demo Modu (Örnek Veritabanı)'
      : `${state.credentials.host}:${state.credentials.port}`;
  }

  if (!schemaSelect) return;
  schemaSelect.innerHTML = '';
  state.schemas.forEach(schema => {
    const opt = document.createElement('option');
    opt.value = schema;
    opt.textContent = schema;
    schemaSelect.appendChild(opt);
  });
}

/**
 * Show Main Workspace Layout
 */
function showWorkspace() {
  const workbenchHome = document.getElementById('workbench-home');
  const modal = document.getElementById('connection-modal');
  const connectionBar = document.getElementById('active-connection-bar');
  const workspace = document.getElementById('main-workspace');

  if (workbenchHome) workbenchHome.classList.add('hidden');
  if (modal) modal.classList.add('hidden');
  if (connectionBar) connectionBar.classList.remove('hidden');
  if (workspace) workspace.classList.remove('hidden');
}
