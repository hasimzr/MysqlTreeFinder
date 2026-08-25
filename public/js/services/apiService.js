/**
 * MySQL Tree Schema Finder - Backend API Service
 */

import { state, resetHistory } from '../state.js';
import { showToast } from '../utils.js';

/**
 * Fetch saved connections list from backend
 */
export async function loadSavedConnections() {
  try {
    const response = await fetch('/api/connections');
    if (!response.ok) {
      throw new Error(`Sunucu yanıt vermedi: ${response.status}`);
    }
    const data = await response.json();
    if (data.success && Array.isArray(data.connections)) {
      state.savedConnections = data.connections;
    }
  } catch (e) {
    console.warn('Sunucudan bağlantılar çekilemedi:', e.message);
  }
}

/**
 * Add or update a connection configuration in backend
 */
export async function addOrUpdateConnection(connObj, onRender) {
  // Optimistic UI update
  const existingIndex = state.savedConnections.findIndex(c => c.id === connObj.id);
  if (existingIndex >= 0) {
    state.savedConnections[existingIndex] = { ...state.savedConnections[existingIndex], ...connObj };
  } else {
    state.savedConnections.unshift(connObj);
  }
  if (typeof onRender === 'function') onRender();

  try {
    const response = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connObj)
    });
    const data = await response.json();
    if (data.success && Array.isArray(data.connections)) {
      state.savedConnections = data.connections;
      if (typeof onRender === 'function') onRender();
    }
  } catch (e) {
    console.warn('Backend save sync error:', e);
  }
}

/**
 * Delete connection from backend
 */
export async function deleteConnection(connId, onRender) {
  // Optimistic UI update
  state.savedConnections = state.savedConnections.filter(c => c.id !== connId);
  if (typeof onRender === 'function') onRender();
  showToast('Bağlantı silindi.');

  try {
    const response = await fetch(`/api/connections/${encodeURIComponent(connId)}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    if (data.success && Array.isArray(data.connections)) {
      state.savedConnections = data.connections;
      if (typeof onRender === 'function') onRender();
    }
  } catch (e) {
    console.warn('Backend delete sync error:', e);
  }
}

/**
 * Attempt MySQL database connection and fetch schemas
 */
export async function attemptConnection(creds, uiCallbacks = {}) {
  const { setLoadingState, showError, hideError, populateSchemaSelector, showWorkspace, renderTree, showWelcome } = uiCallbacks;

  if (typeof setLoadingState === 'function') setLoadingState(true);
  if (typeof hideError === 'function') hideError();

  try {
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });

    const resData = await response.json();

    if (!response.ok || !resData.success) {
      throw new Error(resData.message || 'Veritabanı bağlantısı kurulamadı.');
    }

    state.credentials = creds;
    state.schemas = resData.databases || [];

    if (typeof populateSchemaSelector === 'function') populateSchemaSelector();
    if (typeof showWorkspace === 'function') showWorkspace();

    showToast(resData.message || 'Bağlantı Başarılı!');

    // Automatically select default/first database schema
    let initialSchema = creds.database && state.schemas.includes(creds.database)
      ? creds.database
      : state.schemas[0] || 'ecommerce_prod';

    const schemaSelect = document.getElementById('schema-select');
    if (schemaSelect) schemaSelect.value = initialSchema;

    await loadSchemaTree(initialSchema, { renderTree, showWelcome });
    return true;

  } catch (err) {
    if (typeof showError === 'function') showError(err.message);
    return false;
  } finally {
    if (typeof setLoadingState === 'function') setLoadingState(false);
  }
}

/**
 * Load database schema tree structure
 */
export async function loadSchemaTree(schemaName, uiCallbacks = {}) {
  const { renderTree, showWelcome } = uiCallbacks;
  state.currentSchema = schemaName;
  showToast(`${schemaName} şeması yükleniyor...`);

  try {
    const response = await fetch('/api/schema-tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentials: state.credentials,
        schemaName: schemaName
      })
    });

    const resData = await response.json();
    if (!response.ok || !resData.success) {
      throw new Error(resData.message || 'Şema detayları alınamadı.');
    }

    state.treeData = resData.data;
    if (typeof renderTree === 'function') renderTree();

    resetHistory();
    if (typeof showWelcome === 'function') showWelcome();

  } catch (err) {
    showToast(`Hata: ${err.message}`);
  }
}

/**
 * Fetch table details (sample data, DDL, indexes, relations)
 */
export async function fetchTableDetailsApi(tableName) {
  const response = await fetch('/api/table-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials: state.credentials,
      schemaName: state.currentSchema,
      tableName: tableName
    })
  });

  const resData = await response.json();
  if (!response.ok || !resData.success) {
    throw new Error(resData.message || 'Tablo detayları alınamadı.');
  }

  return resData.data;
}

/**
 * Fetch table relations for nested trees
 */
export async function fetchNestedRelationsApi(tableName) {
  const response = await fetch('/api/table-relations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials: state.credentials,
      schemaName: state.currentSchema,
      tableName: tableName
    })
  });

  const resData = await response.json();
  if (!response.ok || !resData.success) {
    throw new Error(resData.message || 'İlişkiler alınamadı.');
  }

  return resData.data.relations || { parents: [], children: [] };
}

/**
 * Fetch paginated table data
 */
export async function fetchTableDataApi(tableName, page = 1, limit = 25) {
  const response = await fetch('/api/table-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials: state.credentials,
      schemaName: state.currentSchema,
      tableName: tableName,
      page: page,
      limit: limit
    })
  });

  const resData = await response.json();
  if (!response.ok || !resData.success) {
    throw new Error(resData.message || 'Veriler alınamadı.');
  }

  return resData.data;
}

/**
 * Execute custom SQL query against MySQL database
 */
export async function executeSqlQueryApi(query, schemaName) {
  const response = await fetch('/api/execute-query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials: state.credentials,
      schemaName: schemaName || state.currentSchema,
      query: query
    })
  });

  const resData = await response.json();
  if (!response.ok && !resData.message) {
    throw new Error(`Sorgu çalıştırılamadı: ${response.status}`);
  }
  return resData;
}


