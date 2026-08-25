/**
 * MySQL Tree Schema Finder - Hash-Based URL Router
 *
 * URL Format:
 *   /                                        → Workbench home
 *   /#db/{connId}                            → Connected to a database server
 *   /#db/{connId}/{schema}                   → Specific schema selected
 *   /#db/{connId}/{schema}/{table}           → Table detail open
 *   /#db/{connId}/{schema}/{table}/{tab}     → Specific tab active (tab-columns, tab-data, etc.)
 */

import { state } from './state.js';

// ─── Segment Helpers ─────────────────────────────────────────────────────────

function encSeg(str) {
  return encodeURIComponent(str || '');
}

function decSeg(str) {
  try {
    return decodeURIComponent(str || '');
  } catch {
    return str || '';
  }
}

// ─── Parse / Build ────────────────────────────────────────────────────────────

/**
 * Parse the current location.hash into a structured object.
 * @returns {{ connId?: string, schema?: string, table?: string, tab?: string }}
 */
export function parseHash() {
  const raw = location.hash.replace(/^#/, ''); // strip leading #
  if (!raw || raw === '/') return {};

  const segments = raw.split('/').map(decSeg);
  // segments[0] === 'db'
  if (segments[0] !== 'db') return {};

  const [, connId, schema, table, tab] = segments;
  return {
    connId: connId || undefined,
    schema: schema || undefined,
    table: table || undefined,
    tab: tab || undefined
  };
}

/**
 * Build a hash string from parts. Only includes parts that are defined.
 */
export function buildHash({ connId, schema, table, tab } = {}) {
  if (!connId) return '#';
  let hash = `#db/${encSeg(connId)}`;
  if (schema) hash += `/${encSeg(schema)}`;
  if (table) hash += `/${encSeg(table)}`;
  if (tab) hash += `/${encSeg(tab)}`;
  return hash;
}

/**
 * Get the href string for a given table name based on current state.
 * Useful for building <a href> links in components.
 */
export function getTableHref(tableName, tab) {
  const connId = state.credentials && state.credentials.id;
  const schema = state.currentSchema;
  return buildHash({ connId, schema, table: tableName, tab });
}


// ─── Push / Replace ───────────────────────────────────────────────────────────

/**
 * Update the URL hash without triggering a page reload.
 * Uses replaceState when only the tab changes, pushState otherwise.
 */
export function pushHash(params, replace = false) {
  const newHash = buildHash(params);
  if (newHash === location.hash) return; // no change

  if (replace) {
    history.replaceState(null, '', newHash);
  } else {
    history.pushState(null, '', newHash);
  }
}

/**
 * Get the current hash parts from state, then push with overrides.
 * Useful for partial updates (e.g., only changing the tab).
 */
export function updateHash(overrides = {}, replace = false) {
  const current = parseHash();
  const merged = {
    connId: current.connId || (state.credentials && state.credentials.id),
    schema: current.schema || state.currentSchema,
    table: current.table || state.currentTableName || undefined,
    tab: current.tab || undefined,
    ...overrides
  };
  pushHash(merged, replace);
}

// ─── Event Listener ───────────────────────────────────────────────────────────

let _hashChangeCallback = null;

/**
 * Register a callback fired on popstate (browser back/forward).
 * Also fired when user manually edits the URL hash.
 */
export function onHashChange(callback) {
  _hashChangeCallback = callback;
  window.addEventListener('popstate', () => {
    if (typeof _hashChangeCallback === 'function') {
      _hashChangeCallback(parseHash());
    }
  });
}

// ─── Restore from Hash ────────────────────────────────────────────────────────

/**
 * On page load, read the hash and restore the application state.
 * Returns { restored: boolean, pending?: { table, tab } } so callers
 * know whether anything was restored and what still needs to be done
 * after async operations (like connecting) complete.
 *
 * @param {object} callbacks - Same callbacks object from app.js
 */
export async function restoreFromHash(callbacks) {
  const params = parseHash();

  // Nothing in the hash → show workbench home (default)
  if (!params.connId) return { restored: false };

  // Find the saved connection with this ID
  const conn = state.savedConnections.find(c => c.id === params.connId);
  if (!conn) {
    console.warn('[Router] Connection not found for id:', params.connId);
    return { restored: false };
  }

  // If connection requires a password prompt, open the modal and store pending params
  if (conn.askPassword || (!conn.password && !conn.isMock)) {
    // Store pending navigation so we can resume after user enters password
    state._pendingRouteParams = params;
    if (typeof callbacks.showPasswordPromptModal === 'function') {
      callbacks.showPasswordPromptModal(conn);
    }
    return { restored: true, needsPassword: true };
  }

  // Attempt connection silently
  const success = await callbacks.attemptConnectionCb(conn);
  if (!success) return { restored: false };

  // Select schema
  const targetSchema = params.schema || state.currentSchema;
  if (targetSchema && targetSchema !== state.currentSchema) {
    const { loadSchemaTree } = await import('./services/apiService.js');
    const { renderTreeView } = await import('./components/SchemaTree.js');
    const { showWelcomeState } = await import('./components/TableDetail.js');
    await loadSchemaTree(targetSchema, {
      renderTree: () => renderTreeView(callbacks.onSelectTable),
      showWelcome: () => showWelcomeState()
    });
    const schemaSelect = document.getElementById('schema-select');
    if (schemaSelect) schemaSelect.value = targetSchema;
  }

  // Open table
  if (params.table && state.treeData) {
    const tableObj = state.treeData.tables.find(t => t.name === params.table)
      || { name: params.table, type: 'TABLE', columns: [] };

    const { openTableDetail } = await import('./components/TableDetail.js');
    const { highlightSidebarTable } = await import('./components/SchemaTree.js');

    if (typeof highlightSidebarTable === 'function') highlightSidebarTable(params.table);
    await openTableDetail(tableObj, { skipHashUpdate: true }, callbacks);

    // Activate tab
    if (params.tab) {
      activateTab(params.tab);
    }
  }

  return { restored: true };
}

/**
 * Resume a pending route after user has entered their password and connected.
 * Call this right after a successful connection when state._pendingRouteParams is set.
 */
export async function resumePendingRoute(callbacks) {
  const params = state._pendingRouteParams;
  if (!params) return;
  delete state._pendingRouteParams;

  const targetSchema = params.schema || state.currentSchema;
  if (targetSchema && targetSchema !== state.currentSchema) {
    const { loadSchemaTree } = await import('./services/apiService.js');
    const { renderTreeView } = await import('./components/SchemaTree.js');
    const { showWelcomeState } = await import('./components/TableDetail.js');
    await loadSchemaTree(targetSchema, {
      renderTree: () => renderTreeView(callbacks.onSelectTable),
      showWelcome: () => showWelcomeState()
    });
    const schemaSelect = document.getElementById('schema-select');
    if (schemaSelect) schemaSelect.value = targetSchema;
  }

  if (params.table && state.treeData) {
    const tableObj = state.treeData.tables.find(t => t.name === params.table)
      || { name: params.table, type: 'TABLE', columns: [] };
    const { openTableDetail } = await import('./components/TableDetail.js');
    const { highlightSidebarTable } = await import('./components/SchemaTree.js');
    if (typeof highlightSidebarTable === 'function') highlightSidebarTable(params.table);
    await openTableDetail(tableObj, { skipHashUpdate: true }, callbacks);
    if (params.tab) activateTab(params.tab);
  }
}

// ─── Tab Activation Helper ────────────────────────────────────────────────────

/**
 * Programmatically activate a tab pane by its ID (e.g. 'tab-columns').
 */
export function activateTab(tabId) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  let found = false;
  tabBtns.forEach(btn => {
    const target = btn.getAttribute('data-tab');
    if (target === tabId) {
      btn.classList.add('active');
      found = true;
    } else {
      btn.classList.remove('active');
    }
  });

  tabPanes.forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  // Special handling for genealogy canvas
  if (tabId === 'tab-genealogy' && found) {
    import('./components/GenealogyView.js').then(({ fitCanvasView }) => {
      setTimeout(fitCanvasView, 30);
    });
  }
}
