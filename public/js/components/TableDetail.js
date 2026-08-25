/**
 * MySQL Tree Schema Finder - Table Detail & Inspection Component
 */

import { state, pushHistory } from '../state.js';
import { refreshIcons, escapeHtml, makeTableResizable, setupTableShiftScroll, showToast } from '../utils.js';
import { fetchTableDetailsApi, fetchTableDataApi } from '../services/apiService.js';
import { renderRelationsGrid, renderTextHierarchyView, updateRelationsViewMode } from './RelationsView.js';
import { renderGenealogyView, fitCanvasView } from './GenealogyView.js';
import { highlightSql } from './SqlHighlighter.js';
import { updateHash } from '../router.js';

export async function openTableDetail(table, options = {}, callbacks = {}) {
  const { highlightSidebarTable } = callbacks;
  state.selectedTable = table;

  // Track Navigation History if not navigating via Back/Forward buttons
  if (!options.isHistoryNav) {
    pushHistory(table);
  }

  // Update URL hash to reflect selected table (skip if triggered by router restore)
  if (!options.skipHashUpdate) {
    updateHash({ table: table.name, tab: undefined });
  }

  updateHistoryButtonsUI();

  // DOM Elements
  const welcomeState = document.getElementById('welcome-empty-state');
  const detailPanel = document.getElementById('detail-panel');
  const detailTypeBadge = document.getElementById('detail-item-type-badge');
  const detailTitle = document.getElementById('detail-item-title');
  const detailSubtitle = document.getElementById('detail-item-subtitle');
  const detailRows = document.getElementById('detail-meta-rows');
  const detailEngine = document.getElementById('detail-meta-engine');
  const detailCols = document.getElementById('detail-meta-cols');

  if (welcomeState) welcomeState.classList.add('hidden');
  if (detailPanel) detailPanel.classList.remove('hidden');

  // Hide SQL console panel if open (SQL console is a separate view)
  const sqlConsolePanel = document.getElementById('sql-console-main-panel');
  if (sqlConsolePanel) sqlConsolePanel.classList.add('hidden');
  const btnOpenSql = document.getElementById('btn-open-sql-console');
  if (btnOpenSql) btnOpenSql.classList.remove('active');

  // Update Header Metadata
  if (detailTypeBadge) {
    detailTypeBadge.textContent = table.type || 'TABLE';
    detailTypeBadge.className = `badge ${table.type === 'VIEW' ? 'type-view' : 'type-table'}`;
  }
  if (detailTitle) detailTitle.textContent = table.name;
  if (detailSubtitle) detailSubtitle.textContent = `${state.currentSchema}.${table.name}`;
  if (detailRows) detailRows.textContent = Number(table.rowCount || 0).toLocaleString('tr-TR');
  if (detailEngine) detailEngine.textContent = table.engine || 'InnoDB';
  if (detailCols) detailCols.textContent = table.columns ? table.columns.length : 0;

  // 1. Render Columns Table
  renderColumnsTable(table.columns);

  // 2. Fetch & Render Table Details (Sample Data, DDL, Indexes, Relations) via API
  fetchTableDetails(table.name, callbacks);
}

export function renderColumnsTable(columns) {
  const body = document.getElementById('columns-table-body');
  if (!body) return;
  body.innerHTML = '';

  if (!columns || columns.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;">Sütun bulunamadı.</td></tr>`;
    return;
  }

  columns.forEach(col => {
    const tr = document.createElement('tr');

    let keyBadge = '-';
    if (col.isPk) keyBadge = `<span class="badge-pk"><i data-lucide="key-round" width="11" height="11"></i> PRIMARY</span>`;
    else if (col.isFk) keyBadge = `<span class="badge-fk"><i data-lucide="link-2" width="11" height="11"></i> FK</span>`;

    let fkText = '-';
    if (col.isFk && col.foreignKey) {
      fkText = `<span class="fk-relation"><i data-lucide="arrow-right" width="11" height="11"></i> ${col.foreignKey.targetTable}.${col.foreignKey.targetColumn}</span>`;
    }

    tr.innerHTML = `
      <td><div class="cell-scroll">${keyBadge}</div></td>
      <td class="col-name"><div class="cell-scroll">${escapeHtml(col.name)}</div></td>
      <td class="col-type"><div class="cell-scroll">${escapeHtml(col.columnType || col.dataType)}</div></td>
      <td><div class="cell-scroll">${col.isNullable ? '<span style="color:var(--accent-emerald);">EVET</span>' : '<span style="color:var(--text-dim);">HAYIR</span>'}</div></td>
      <td style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);"><div class="cell-scroll">${col.default !== null && col.default !== undefined ? escapeHtml(col.default) : '<em>null</em>'}</div></td>
      <td style="font-size:0.8rem; color:var(--accent-amber);"><div class="cell-scroll">${escapeHtml(col.extra || '-')}</div></td>
      <td><div class="cell-scroll">${fkText}</div></td>
    `;

    body.appendChild(tr);
  });

  refreshIcons();

  const columnsTable = document.querySelector('#tab-columns .data-table');
  if (columnsTable) makeTableResizable(columnsTable);

  const columnsWrapper = document.querySelector('#tab-columns .table-wrapper');
  if (columnsWrapper) setupTableShiftScroll(columnsWrapper);
}

export function initTableDataListeners() {
  const pageSizeSelect = document.getElementById('page-size-select');
  if (pageSizeSelect && !pageSizeSelect.dataset.listenerAttached) {
    pageSizeSelect.dataset.listenerAttached = 'true';
    pageSizeSelect.addEventListener('change', (e) => {
      const newLimit = parseInt(e.target.value) || 25;
      if (state.currentTableName) {
        loadTableDataPage(state.currentTableName, 1, newLimit);
      }
    });
  }
}

export async function fetchTableDetails(tableName, callbacks = {}) {
  initTableDataListeners();
  const sampleContainer = document.getElementById('sample-data-container');
  const ddlBlock = document.getElementById('ddl-code-block');
  const idxContainer = document.getElementById('indexes-container');
  const relContainer = document.getElementById('relations-container');
  const relTextContainer = document.getElementById('relations-text-container');

  if (sampleContainer) sampleContainer.innerHTML = '<div class="loading-state" style="padding:20px; color:var(--text-muted);">Veriler yükleniyor...</div>';
  if (ddlBlock) ddlBlock.textContent = '-- SQL DDL Çekiliyor...';
  if (idxContainer) idxContainer.innerHTML = '<div style="color:var(--text-muted);">İndeksler yükleniyor...</div>';
  if (relContainer) relContainer.innerHTML = '<div style="color:var(--text-muted);">İlişkili tablolar analiz ediliyor...</div>';

  const relCallbacks = {
    onSelectTable: (tbl) => openTableDetail(tbl, {}, callbacks)
  };

  try {
    const details = await fetchTableDetailsApi(tableName);
    state.currentTableName = tableName;
    state.currentRelations = details.relations || { parents: [], children: [] };

    // Render Data Table (with pagination)
    renderSampleDataTable(details.tableData || details.sampleData, tableName);

    // Render DDL Code
    if (ddlBlock) ddlBlock.innerHTML = highlightSql(details.createSql || `-- DDL bilgisi mevcut değil.`);

    // Render Indexes
    renderIndexesGrid(details.indexes);

    // Render Relations
    renderRelationsGrid(state.currentRelations, tableName, relCallbacks);

    if (state.isTextViewMode) {
      renderTextHierarchyView(state.currentRelations, tableName, relCallbacks);
    }

    // Render Genealogy View (Soy Ağacı)
    renderGenealogyView(tableName, callbacks);

  } catch (err) {
    if (sampleContainer) sampleContainer.innerHTML = `<div style="padding:20px; color:var(--accent-rose);">Hata: ${err.message}</div>`;
    if (ddlBlock) ddlBlock.textContent = `-- Hata: ${err.message}`;
    if (relContainer) relContainer.innerHTML = `<div style="padding:20px; color:var(--accent-rose);">Hata: ${err.message}</div>`;
    if (relTextContainer) relTextContainer.innerHTML = `<div style="padding:20px; color:var(--accent-rose);">Hata: ${err.message}</div>`;
  }
}

export async function loadTableDataPage(tableName, page, limit) {
  const container = document.getElementById('sample-data-container');
  const paginationContainer = document.getElementById('table-pagination-container');
  if (container) {
    container.innerHTML = '<div class="loading-state" style="padding:20px; color:var(--text-muted);">Veriler yükleniyor...</div>';
  }

  try {
    const dataResult = await fetchTableDataApi(tableName, page, limit);
    renderSampleDataTable(dataResult, tableName);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--accent-rose);">Veriler yüklenirken hata oluştu: ${escapeHtml(err.message)}</div>`;
    }
    if (paginationContainer) {
      paginationContainer.innerHTML = '';
    }
  }
}

export function renderSampleDataTable(sampleRowsOrObject, tableName) {
  let rows = [];
  let totalRows = 0;
  let page = 1;
  let limit = 25;
  let totalPages = 1;

  if (sampleRowsOrObject && typeof sampleRowsOrObject === 'object' && Array.isArray(sampleRowsOrObject.rows)) {
    rows = sampleRowsOrObject.rows;
    totalRows = sampleRowsOrObject.totalRows || rows.length;
    page = sampleRowsOrObject.page || 1;
    limit = sampleRowsOrObject.limit || 25;
    totalPages = sampleRowsOrObject.totalPages || Math.max(1, Math.ceil(totalRows / limit));
  } else if (Array.isArray(sampleRowsOrObject)) {
    rows = sampleRowsOrObject;
    totalRows = rows.length;
    page = 1;
    limit = Math.max(1, rows.length);
    totalPages = 1;
  }

  state.tablePagination = { page, limit, totalRows, totalPages };

  const currentTbl = tableName || state.currentTableName;

  // 1. Update Tab Label Header
  const tabLabelEl = document.getElementById('tab-sample-label');
  if (tabLabelEl) {
    tabLabelEl.textContent = `Veriler (${totalRows.toLocaleString('tr-TR')} Kayıt)`;
  }

  // 2. Update Header Info Toolbar
  const recordInfoEl = document.getElementById('table-record-info');
  if (recordInfoEl) {
    if (totalRows === 0) {
      recordInfoEl.textContent = 'Tabloda hiç kayıt bulunamadı';
    } else {
      const startNum = ((page - 1) * limit) + 1;
      const endNum = Math.min(page * limit, totalRows);
      recordInfoEl.textContent = `${startNum.toLocaleString('tr-TR')} - ${endNum.toLocaleString('tr-TR')} / ${totalRows.toLocaleString('tr-TR')} Kayıt Gösteriliyor`;
    }
  }

  // 3. Sync Page Size Dropdown
  const pageSizeSelect = document.getElementById('page-size-select');
  if (pageSizeSelect) {
    pageSizeSelect.value = String(limit);
  }

  // 4. Render Table HTML in #sample-data-container
  const container = document.getElementById('sample-data-container');
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">Tabloda gösterilecek kayıt bulunamadı.</div>';
    renderPaginationControls(page, totalPages, totalRows, limit, currentTbl);
    return;
  }

  const headers = Object.keys(rows[0]);
  let tableHtml = `<table class="data-table"><thead><tr>`;

  headers.forEach(h => {
    const lower = h.toLowerCase();
    let minW = 130;
    if ((lower === 'id' || lower === '#' || lower === 'pk') && headers.length > 1) {
      minW = 70;
    } else if (lower.includes('date') || lower.includes('time') || lower === 'created_at' || lower === 'updated_at') {
      minW = 170;
    }
    tableHtml += `<th style="width: ${minW}px;" title="${escapeHtml(h)}"><div class="cell-scroll">${escapeHtml(h)}</div></th>`;
  });
  tableHtml += `</tr></thead><tbody>`;

  rows.forEach(row => {
    tableHtml += `<tr>`;
    headers.forEach(h => {
      const val = row[h];
      const isNull = val === null;
      const rawVal = isNull ? '' : String(val);
      const displayVal = isNull ? '<em style="color:var(--text-dim)">null</em>' : escapeHtml(rawVal);
      tableHtml += `<td style="font-family:var(--font-mono); font-size:0.8rem;" data-col="${escapeHtml(h)}" data-is-null="${isNull}" data-raw-value="${escapeHtml(rawVal)}"><div class="cell-scroll">${displayVal}</div></td>`;
    });
    tableHtml += `</tr>`;
  });

  tableHtml += `</tbody></table>`;
  container.innerHTML = tableHtml;

  const sampleTable = container.querySelector('.data-table');
  if (sampleTable) makeTableResizable(sampleTable);
  setupTableShiftScroll(container);

  // 5. Render Pagination Controls
  renderPaginationControls(page, totalPages, totalRows, limit, currentTbl);
  refreshIcons();
}

export function renderPaginationControls(page, totalPages, totalRows, limit, targetTableName) {
  const paginationContainer = document.getElementById('table-pagination-container');
  if (!paginationContainer) return;

  const currentTbl = targetTableName || state.currentTableName;

  if (totalRows === 0 || totalPages <= 1) {
    paginationContainer.innerHTML = `
      <div class="pagination-info">
        Sayfa <strong>1</strong> / <strong>${totalPages || 1}</strong>
      </div>
      <div class="pagination-nav">
        <button class="page-btn" disabled title="İlk Sayfa"><i data-lucide="chevrons-left" width="14" height="14"></i></button>
        <button class="page-btn" disabled title="Önceki Sayfa"><i data-lucide="chevron-left" width="14" height="14"></i> Önceki</button>
        <button class="page-btn active">1</button>
        <button class="page-btn" disabled title="Sonraki Sayfa">Sonraki <i data-lucide="chevron-right" width="14" height="14"></i></button>
        <button class="page-btn" disabled title="Son Sayfa"><i data-lucide="chevrons-right" width="14" height="14"></i></button>
      </div>
    `;
    refreshIcons();
    return;
  }

  const pageRange = [];
  const maxButtons = 5;
  let startPage = Math.max(1, page - 2);
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    pageRange.push(p);
  }

  let html = `<div class="pagination-info">
    Sayfa <strong>${page}</strong> / <strong>${totalPages}</strong>
  </div>
  <div class="pagination-nav">`;

  const prevDisabled = page <= 1 ? 'disabled' : '';
  html += `<button class="page-btn" ${prevDisabled} data-target-page="1" title="İlk Sayfa"><i data-lucide="chevrons-left" width="14" height="14"></i></button>`;
  html += `<button class="page-btn" ${prevDisabled} data-target-page="${page - 1}" title="Önceki Sayfa"><i data-lucide="chevron-left" width="14" height="14"></i> Önceki</button>`;

  if (startPage > 1) {
    html += `<button class="page-btn" data-target-page="1">1</button>`;
    if (startPage > 2) html += `<span class="page-ellipsis">...</span>`;
  }

  pageRange.forEach(p => {
    const activeClass = p === page ? 'active' : '';
    html += `<button class="page-btn ${activeClass}" data-target-page="${p}">${p}</button>`;
  });

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="page-ellipsis">...</span>`;
    html += `<button class="page-btn" data-target-page="${totalPages}">${totalPages}</button>`;
  }

  const nextDisabled = page >= totalPages ? 'disabled' : '';
  html += `<button class="page-btn" ${nextDisabled} data-target-page="${page + 1}" title="Sonraki Sayfa">Sonraki <i data-lucide="chevron-right" width="14" height="14"></i></button>`;
  html += `<button class="page-btn" ${nextDisabled} data-target-page="${totalPages}" title="Son Sayfa"><i data-lucide="chevrons-right" width="14" height="14"></i></button>`;

  html += `<div class="page-jump">
    <input type="number" class="page-jump-input" min="1" max="${totalPages}" placeholder="${page}" id="page-jump-input" title="Sayfaya Git">
    <button class="page-btn btn-jump-go" id="btn-page-jump">Git</button>
  </div>`;

  html += `</div>`;

  paginationContainer.innerHTML = html;
  refreshIcons();

  const buttons = paginationContainer.querySelectorAll('.page-btn[data-target-page]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPage = parseInt(btn.getAttribute('data-target-page'));
      if (targetPage && targetPage !== page) {
        loadTableDataPage(currentTbl, targetPage, limit);
      }
    });
  });

  const jumpBtn = document.getElementById('btn-page-jump');
  const jumpInput = document.getElementById('page-jump-input');
  const handleJump = () => {
    if (!jumpInput) return;
    const targetPage = parseInt(jumpInput.value);
    if (targetPage && targetPage >= 1 && targetPage <= totalPages && targetPage !== page) {
      loadTableDataPage(currentTbl, targetPage, limit);
    }
  };

  if (jumpBtn) jumpBtn.addEventListener('click', handleJump);
  if (jumpInput) {
    jumpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJump();
    });
  }
}


export function renderIndexesGrid(indexes) {
  const container = document.getElementById('indexes-container');
  if (!container) return;

  if (!indexes || indexes.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);">Tanimlanmis indeks bulunamadi.</div>';
    return;
  }

  container.innerHTML = '';
  indexes.forEach(idx => {
    const card = document.createElement('div');
    card.className = 'index-card';
    const iconName = idx.name === 'PRIMARY' ? 'key-round' : (idx.isUnique ? 'shield-check' : 'layers');
    card.innerHTML = `
      <div class="index-header">
        <span class="index-name"><i data-lucide="${iconName}" width="14" height="14"></i> ${escapeHtml(idx.name)}</span>
        <span class="badge ${idx.isUnique ? 'type-table' : 'type-view'}">${idx.isUnique ? 'UNIQUE' : 'INDEX'}</span>
      </div>
      <div class="index-columns">Sütunlar: ${escapeHtml(idx.columns.join(', '))}</div>
      <div style="font-size:0.75rem; color:var(--text-dim);">Tip: ${escapeHtml(idx.type || 'BTREE')}</div>
    `;
    container.appendChild(card);
  });
  refreshIcons();
}

export function updateHistoryButtonsUI() {
  const btnNavBack = document.getElementById('btn-nav-back');
  const btnNavForward = document.getElementById('btn-nav-forward');

  if (!btnNavBack || !btnNavForward) return;

  const canGoBack = state.historyIndex > 0;
  const canGoForward = state.historyIndex < state.history.length - 1;

  btnNavBack.disabled = !canGoBack;
  btnNavForward.disabled = !canGoForward;

  if (canGoBack) {
    const prevTable = state.history[state.historyIndex - 1];
    btnNavBack.title = `Önceki Tablo: ${prevTable.name} (Alt + Sol Ok)`;
  } else {
    btnNavBack.title = `Önceki Tabloya Git (Alt + Sol Ok)`;
  }

  if (canGoForward) {
    const nextTable = state.history[state.historyIndex + 1];
    btnNavForward.title = `Sonraki Tablo: ${nextTable.name} (Alt + Sağ Ok)`;
  } else {
    btnNavForward.title = `Sonraki Tabloya Git (Alt + Sağ Ok)`;
  }
}

export function getFullTableObj(tableName) {
  if (state.treeData && state.treeData.tables) {
    const found = state.treeData.tables.find(t => t.name === tableName);
    if (found) return found;
  }
  return { name: tableName, type: 'TABLE', columns: [] };
}

export function navigateHistoryBack(callbacks = {}) {
  const { highlightSidebarTable } = callbacks;
  if (state.historyIndex > 0) {
    state.historyIndex--;
    const prevTable = state.history[state.historyIndex];
    const fullTable = getFullTableObj(prevTable.name);
    if (typeof highlightSidebarTable === 'function') highlightSidebarTable(fullTable.name);
    openTableDetail(fullTable, { isHistoryNav: true }, callbacks);
  }
}

export function navigateHistoryForward(callbacks = {}) {
  const { highlightSidebarTable } = callbacks;
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    const nextTable = state.history[state.historyIndex];
    const fullTable = getFullTableObj(nextTable.name);
    if (typeof highlightSidebarTable === 'function') highlightSidebarTable(fullTable.name);
    openTableDetail(fullTable, { isHistoryNav: true }, callbacks);
  }
}

export function showWelcomeState() {
  const welcomeState = document.getElementById('welcome-empty-state');
  const detailPanel = document.getElementById('detail-panel');
  if (welcomeState) welcomeState.classList.remove('hidden');
  if (detailPanel) detailPanel.classList.add('hidden');
}

export function setupTableDetailEvents(callbacks = {}) {
  const btnNavBack = document.getElementById('btn-nav-back');
  const btnNavForward = document.getElementById('btn-nav-forward');
  const btnCopyDdl = document.getElementById('btn-copy-ddl');
  const btnRelToggleView = document.getElementById('btn-rel-toggle-view');
  const btnFullscreenTab = document.getElementById('btn-fullscreen-tab');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  if (btnNavBack) {
    btnNavBack.addEventListener('click', () => navigateHistoryBack(callbacks));
  }

  if (btnNavForward) {
    btnNavForward.addEventListener('click', () => navigateHistoryForward(callbacks));
  }

  if (btnCopyDdl) {
    btnCopyDdl.addEventListener('click', () => {
      const ddlBlock = document.getElementById('ddl-code-block');
      if (ddlBlock) {
        navigator.clipboard.writeText(ddlBlock.textContent).then(() => {
          showToast('SQL DDL Panoya Kopyalandı!');
        });
      }
    });
  }

  if (btnRelToggleView) {
    btnRelToggleView.addEventListener('click', () => {
      state.isTextViewMode = !state.isTextViewMode;
      const relCallbacks = {
        onSelectTable: (tbl) => openTableDetail(tbl, {}, callbacks)
      };
      updateRelationsViewMode(relCallbacks);
    });
  }

  // Fullscreen Mode Toggle
  if (btnFullscreenTab) {
    btnFullscreenTab.addEventListener('click', toggleFullscreen);
  }

  // Tabs Switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTab);
      if (targetPane) targetPane.classList.add('active');

      if (targetTab === 'tab-genealogy') {
        setTimeout(() => {
          fitCanvasView();
        }, 30);
      }

      // Update URL hash with active tab (replace so tab switches don't pollute history)
      updateHash({ tab: targetTab }, true);
    });
  });

  // Native browser ESC / fullscreen change events
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      const detailPanel = document.getElementById('detail-panel');
      if (detailPanel && detailPanel.classList.contains('fullscreen-mode')) {
        detailPanel.classList.remove('fullscreen-mode');
      }
      updateFullscreenButtonUI(false);
    }
  });

  // Alt + Left / Alt + Right shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateHistoryBack(callbacks);
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      navigateHistoryForward(callbacks);
    } else if (e.key === 'Escape') {
      const detailPanel = document.getElementById('detail-panel');
      if (detailPanel && detailPanel.classList.contains('fullscreen-mode')) {
        exitFullscreenState();
      }
    }
  });
}

export function toggleFullscreen() {
  const detailPanel = document.getElementById('detail-panel');
  if (!detailPanel) return;

  const isFS = detailPanel.classList.contains('fullscreen-mode') || document.fullscreenElement === detailPanel;

  if (!isFS) {
    enterFullscreenState();
  } else {
    exitFullscreenState();
  }
}

export function enterFullscreenState() {
  const detailPanel = document.getElementById('detail-panel');
  if (!detailPanel) return;

  detailPanel.classList.add('fullscreen-mode');
  updateFullscreenButtonUI(true);

  if (detailPanel.requestFullscreen) {
    detailPanel.requestFullscreen().catch(() => {});
  } else if (detailPanel.webkitRequestFullscreen) {
    detailPanel.webkitRequestFullscreen().catch(() => {});
  }
}

export function exitFullscreenState() {
  const detailPanel = document.getElementById('detail-panel');
  if (detailPanel) {
    detailPanel.classList.remove('fullscreen-mode');
  }
  updateFullscreenButtonUI(false);

  if (document.fullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen().catch(() => {});
    }
  }
}

function updateFullscreenButtonUI(isFS) {
  const btnFullscreenTab = document.getElementById('btn-fullscreen-tab');
  if (!btnFullscreenTab) return;

  const expandIcon = btnFullscreenTab.querySelector('.icon-expand');
  const compressIcon = btnFullscreenTab.querySelector('.icon-compress');
  const textSpan = btnFullscreenTab.querySelector('.fullscreen-text');

  if (isFS) {
    btnFullscreenTab.classList.add('active');
    if (expandIcon) expandIcon.classList.add('hidden');
    if (compressIcon) compressIcon.classList.remove('hidden');
    if (textSpan) textSpan.textContent = 'Tam Ekrandan Çık';
  } else {
    btnFullscreenTab.classList.remove('active');
    if (expandIcon) expandIcon.classList.remove('hidden');
    if (compressIcon) compressIcon.classList.add('hidden');
    if (textSpan) textSpan.textContent = 'Tam Ekran';
  }
}
