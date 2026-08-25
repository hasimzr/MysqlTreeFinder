/**
 * MySQL Tree Schema Finder - Smart Table Cell Action Pop-confirm & Cell Editor Component
 */

import { state } from '../state.js';
import { escapeHtml, refreshIcons, showToast } from '../utils.js';
import { executeSqlQueryApi } from '../services/apiService.js';
import { highlightSql, attachSqlHighlighter } from './SqlHighlighter.js';
import { attachSqlAutocompleter } from './SqlAutocompleter.js';

let activeCellInfo = null;
let popconfirmEl = null;
let editModalEl = null;
let isRawMode = false;
let isSqlEditMode = false;

/**
 * Initialize Cell Editor & Double-Click Listener for Data Tables
 */
export function initCellEditor() {
  ensurePopconfirmDOM();
  ensureEditModalDOM();

  // Attach global double click listener for table cells
  document.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td');
    if (!td) return;

    // Ensure td is inside a table body
    const table = td.closest('table');
    if (!table || !td.closest('tbody')) return;

    e.preventDefault();
    e.stopPropagation();

    // Determine column name
    let colName = td.getAttribute('data-col');
    if (!colName && table) {
      const ths = table.querySelectorAll('thead th');
      if (ths && ths[td.cellIndex]) {
        colName = ths[td.cellIndex].textContent.trim();
      }
    }

    // Determine table name if available
    let tableName = state.currentTableName || (state.selectedTable ? state.selectedTable.name : '');
    const panel = td.closest('#detail-panel');
    if (panel) {
      const titleEl = panel.querySelector('#detail-item-title');
      if (titleEl && titleEl.textContent) {
        tableName = titleEl.textContent.trim();
      }
    }

    const isNull = td.getAttribute('data-is-null') === 'true';
    let rawValue = td.getAttribute('data-raw-value');
    if (rawValue === null || rawValue === undefined) {
      rawValue = isNull ? 'null' : (td.querySelector('.cell-scroll')?.textContent || td.textContent || '').trim();
    }

    activeCellInfo = {
      cell: td,
      tableName: tableName,
      colName: colName || 'Sütun',
      rawValue: rawValue,
      isNull: isNull
    };

    showPopconfirm(e, activeCellInfo);
  });

  // Close popconfirm on click outside
  document.addEventListener('click', (e) => {
    if (popconfirmEl && !popconfirmEl.classList.contains('hidden')) {
      if (!popconfirmEl.contains(e.target) && !e.target.closest('td')) {
        hidePopconfirm();
      }
    }
  });

  // Close popconfirm on scroll
  document.addEventListener('scroll', () => {
    hidePopconfirm();
  }, true);

  // Keyboard escape key handling
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (popconfirmEl && !popconfirmEl.classList.contains('hidden')) {
        hidePopconfirm();
      } else if (editModalEl && !editModalEl.classList.contains('hidden')) {
        hideEditModal();
      }
    }
  });
}

/**
 * Get Column Metadata from State if available
 */
export function getColumnMeta(tableName, colName) {
  const tblName = tableName || state.currentTableName || (state.selectedTable ? state.selectedTable.name : '');
  let cols = [];

  if (state.selectedTable && state.selectedTable.name === tblName && state.selectedTable.columns) {
    cols = state.selectedTable.columns;
  } else if (state.treeData && state.treeData.tables) {
    const found = state.treeData.tables.find(t => t.name && t.name.toLowerCase() === (tblName || '').toLowerCase());
    if (found && found.columns) cols = found.columns;
  }

  if (cols && cols.length > 0) {
    const matchedCol = cols.find(c => c.name && c.name.toLowerCase() === (colName || '').toLowerCase());
    if (matchedCol) return matchedCol;
  }
  return null;
}

/**
 * Get Primary Key column name for table
 */
export function getTablePrimaryKey(tableName) {
  const tblName = tableName || state.currentTableName || (state.selectedTable ? state.selectedTable.name : '');
  let cols = [];

  if (state.selectedTable && state.selectedTable.name === tblName && state.selectedTable.columns) {
    cols = state.selectedTable.columns;
  } else if (state.treeData && state.treeData.tables) {
    const found = state.treeData.tables.find(t => t.name && t.name.toLowerCase() === (tblName || '').toLowerCase());
    if (found && found.columns) cols = found.columns;
  }

  if (cols && cols.length > 0) {
    const pkCol = cols.find(c => c.isPk);
    if (pkCol) return pkCol.name;
  }
  return 'id';
}

/**
 * Retrieve Primary Key value for specific row <tr>
 */
export function getRowPrimaryKeyVal(td, pkColName) {
  if (!td) return '1';
  const tr = td.closest('tr');
  if (!tr) return '1';

  // 1. Check cell with data-col matching PK name
  const pkTd = tr.querySelector(`td[data-col="${pkColName}"]`);
  if (pkTd) {
    const raw = pkTd.getAttribute('data-raw-value');
    if (raw !== null && raw !== undefined && raw !== '') return raw;
    const txt = (pkTd.querySelector('.cell-scroll')?.textContent || pkTd.textContent || '').trim();
    if (txt && txt !== 'null') return txt;
  }

  // 2. Fallback to 'id' or first cell
  const idTd = tr.querySelector(`td[data-col="id"]`) || tr.querySelector('td');
  if (idTd) {
    const raw = idTd.getAttribute('data-raw-value');
    if (raw !== null && raw !== undefined && raw !== '') return raw;
    const txt = (idTd.querySelector('.cell-scroll')?.textContent || idTd.textContent || '').trim();
    if (txt && txt !== 'null') return txt;
  }

  return '1';
}

/**
 * Generate SQL UPDATE statement for cell edit
 */
export function generateUpdateSql(schemaName, tableName, colName, editedValue, isNull, pkColName, pkValue) {
  const schemaStr = schemaName ? `\`${schemaName}\`.` : '';
  const tableStr = tableName ? `\`${tableName}\`` : '`table_name`';
  const colStr = colName ? `\`${colName}\`` : '`column_name`';

  let valStr = 'NULL';
  if (!isNull) {
    const raw = String(editedValue);
    const colLower = (colName || '').toLowerCase();

    if (/^-?\d+(\.\d+)?$/.test(raw) && !['status', 'code', 'phone', 'zip'].includes(colLower)) {
      valStr = raw;
    } else {
      const escaped = raw.replace(/'/g, "''");
      valStr = `'${escaped}'`;
    }
  }

  const pkColStr = pkColName ? `\`${pkColName}\`` : '`id`';
  let pkValStr = pkValue !== null && pkValue !== undefined ? pkValue : '1';
  if (/^-?\d+$/.test(pkValStr)) {
    // Integer ID
  } else {
    pkValStr = `'${String(pkValStr).replace(/'/g, "''")}'`;
  }

  return `UPDATE ${schemaStr}${tableStr} SET ${colStr} = ${valStr} WHERE ${pkColStr} = ${pkValStr};`;
}

/**
 * Parse enum/set values from columnType string e.g. "enum('ACTIVE','TEST','PASSIVE')"
 */
export function parseEnumType(columnType) {
  if (!columnType) return null;
  const match = String(columnType).match(/^(?:enum|set)\s*\((.+)\)$/i);
  if (!match) return null;

  const rawValues = match[1];
  const values = [];
  const regex = /'((?:\\'|[^'])*)'/g;
  let m;
  while ((m = regex.exec(rawValues)) !== null) {
    values.push(m[1].replace(/\\'/g, "'"));
  }
  return values.length > 0 ? values : null;
}

/**
 * Detect Smart Editor Type for a Column
 */
export function detectSmartEditorType(colName, rawValue, columnMeta) {
  const colLower = (colName || '').toLowerCase();
  const colType = String(columnMeta?.columnType || columnMeta?.dataType || '').toLowerCase();

  // 1. ENUM / SET
  const enumValues = parseEnumType(colType);
  if (enumValues) {
    return { type: 'enum', options: enumValues, label: `ENUM (${enumValues.length} Seçenek)` };
  }

  if (colLower === 'status' && (!columnMeta || colType.includes('enum') || colType.includes('varchar'))) {
    const defaultStatusOptions = ['ACTIVE', 'TEST', 'TEST_SETUP', 'PASSIVE', 'WASTEBASKET', 'SETUP'];
    return { type: 'enum', options: defaultStatusOptions, label: 'ENUM (Status)' };
  }

  // 2. BOOLEAN / TINYINT(1)
  if (colType === 'tinyint(1)' || colType === 'boolean' || colType === 'bool' ||
      colLower.startsWith('is_') || colLower.startsWith('has_') || colLower.startsWith('can_') || colLower === 'active' || colLower === 'enabled') {
    return { type: 'boolean', label: 'BOOLEAN (0 / 1)' };
  }

  // 3. DATE / DATETIME / TIMESTAMP
  if (colType.includes('datetime') || colType.includes('timestamp') ||
      colLower.includes('_at') || colLower.endsWith('time') || colLower.endsWith('_datetime')) {
    return { type: 'datetime', label: 'DATETIME (Tarih & Saat)' };
  }
  if (colType.includes('date') || colLower.includes('date') || colLower.endsWith('_dob')) {
    return { type: 'date', label: 'DATE (Tarih)' };
  }

  // 4. JSON
  if (colType.includes('json') || colLower.includes('json') || colLower.includes('config') || colLower.includes('meta') || colLower.includes('payload')) {
    return { type: 'json', label: 'JSON Verisi' };
  }
  if (rawValue && (rawValue.trim().startsWith('{') || rawValue.trim().startsWith('['))) {
    try {
      JSON.parse(rawValue);
      return { type: 'json', label: 'JSON Verisi' };
    } catch (e) {}
  }

  // 5. NUMBER
  if (colType.includes('int') || colType.includes('decimal') || colType.includes('float') || colType.includes('double') || colType.includes('number')) {
    return { type: 'number', label: 'Sayısal (NUMBER)' };
  }

  // Fallback TEXT
  return { type: 'text', label: 'Metin (TEXT)' };
}

/**
 * Create Popconfirm Popover Element if not present
 */
function ensurePopconfirmDOM() {
  if (document.getElementById('cell-popconfirm')) {
    popconfirmEl = document.getElementById('cell-popconfirm');
    return;
  }

  popconfirmEl = document.createElement('div');
  popconfirmEl.id = 'cell-popconfirm';
  popconfirmEl.className = 'popconfirm-wrapper hidden';
  popconfirmEl.innerHTML = `
    <div class="popconfirm-content">
      <div class="popconfirm-header">
        <span id="popconfirm-col-name" class="popconfirm-title">Hücre İşlemleri</span>
      </div>
      <div class="popconfirm-actions">
        <button type="button" id="btn-popconfirm-copy" class="popconfirm-btn btn-copy" title="Metni Panoya Kopyala">
          <i data-lucide="copy" width="14" height="14"></i>
          <span>Kopyala</span>
        </button>
        <button type="button" id="btn-popconfirm-edit" class="popconfirm-btn btn-edit" title="Hücre Verisini Düzenle">
          <i data-lucide="square-pen" width="14" height="14"></i>
          <span>Düzenle</span>
        </button>
      </div>
    </div>
  `;

  const parentEl = document.fullscreenElement || document.body;
  parentEl.appendChild(popconfirmEl);
  refreshIcons();

  const btnCopy = popconfirmEl.querySelector('#btn-popconfirm-copy');
  const btnEdit = popconfirmEl.querySelector('#btn-popconfirm-edit');

  if (btnCopy) {
    btnCopy.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeCellInfo) return;
      const copyVal = activeCellInfo.isNull ? 'null' : activeCellInfo.rawValue;
      navigator.clipboard.writeText(copyVal).then(() => {
        showToast('Hücre verisi panoya kopyalandı!');
      }).catch(() => {
        showToast('Panoya kopyalama başarısız oldu.');
      });
      hidePopconfirm();
    });
  }

  if (btnEdit) {
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeCellInfo) return;
      const cellInfo = { ...activeCellInfo };
      hidePopconfirm();
      showCellEditModal(cellInfo);
    });
  }
}

/**
 * Display Popconfirm popover positioned near double-clicked cell
 */
function showPopconfirm(event, cellInfo) {
  if (!popconfirmEl) ensurePopconfirmDOM();

  const targetParent = document.fullscreenElement || document.body;
  if (popconfirmEl.parentElement !== targetParent) {
    targetParent.appendChild(popconfirmEl);
  }

  const titleEl = document.getElementById('popconfirm-col-name');
  if (titleEl) {
    titleEl.textContent = cellInfo.colName ? `Sütun: ${cellInfo.colName}` : 'Hücre İşlemleri';
  }

  popconfirmEl.classList.remove('hidden');
  refreshIcons();

  const rect = cellInfo.cell.getBoundingClientRect();
  const popWidth = popconfirmEl.offsetWidth || 180;
  const popHeight = popconfirmEl.offsetHeight || 75;

  let top = rect.bottom + 4;
  let left = rect.left;

  if (rect.bottom + popHeight > window.innerHeight && rect.top - popHeight > 0) {
    top = rect.top - popHeight - 4;
  }
  if (left + popWidth > window.innerWidth - 16) {
    left = window.innerWidth - popWidth - 16;
  }
  if (left < 10) {
    left = 10;
  }

  popconfirmEl.style.top = `${top}px`;
  popconfirmEl.style.left = `${left}px`;
}

/**
 * Hide Popconfirm Popover
 */
export function hidePopconfirm() {
  if (popconfirmEl) {
    popconfirmEl.classList.add('hidden');
  }
}

/**
 * Create Cell Edit Modal Element with SQL Preview & Detailed MySQL Execution Response
 */
function ensureEditModalDOM() {
  if (document.getElementById('cell-edit-modal')) {
    editModalEl = document.getElementById('cell-edit-modal');
    return;
  }

  editModalEl = document.createElement('div');
  editModalEl.id = 'cell-edit-modal';
  editModalEl.className = 'modal-overlay hidden';
  editModalEl.innerHTML = `
    <div class="modal-card modal-card-cell-edit">
      <button type="button" id="btn-cell-edit-close" class="modal-close-btn" title="Pencereyi Kapat">&times;</button>
      <div class="modal-header">
        <div class="modal-icon accent-blue">
          <i data-lucide="square-pen" width="24" height="24"></i>
        </div>
        <div style="flex:1;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <h2>Hücre Verisini Düzenle</h2>
            <span id="cell-edit-type-badge" class="editor-type-badge">TEXT</span>
          </div>
          <p id="cell-edit-subtitle" class="subtitle">Sütun: <strong id="cell-edit-col-name">sütun_adı</strong></p>
        </div>
      </div>

      <div class="cell-edit-body" style="margin: 12px 0 16px 0;">
        <div class="form-group">
          <div class="cell-edit-meta">
            <label for="cell-edit-input" style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Hücre İçeriği:</label>
            <div style="display:flex; gap:8px; align-items:center;">
              <button type="button" id="btn-cell-toggle-mode" class="mode-switch-btn" title="Giriş modunu değiştir">
                <i data-lucide="sliders-horizontal" width="12" height="12"></i> <span id="toggle-mode-text">Düz Metin Modu</span>
              </button>
              <button type="button" id="btn-cell-set-null" class="btn-xs btn-outline-null" title="Değeri NULL olarak ayarla">
                <i data-lucide="ban" width="12" height="12"></i> NULL Yap
              </button>
            </div>
          </div>

          <!-- Dynamic Smart Editor Container -->
          <div id="smart-editor-container" class="smart-editor-container"></div>

          <!-- Fallback Raw Textarea -->
          <div id="raw-textarea-container" class="raw-textarea-container hidden">
            <textarea id="cell-edit-input" class="cell-edit-textarea" rows="5" placeholder="Hücre verisini buraya yazın..."></textarea>
          </div>

          <div class="cell-edit-footer-info">
            <span id="cell-edit-char-count">0 karakter</span>
          </div>
        </div>

        <!-- SQL Update Command Live Preview Card -->
        <div class="sql-preview-card">
          <div class="sql-preview-header">
            <div style="display:flex; align-items:center; gap:6px;">
              <i data-lucide="terminal" width="14" height="14" style="color:var(--primary);"></i>
              <span style="font-size:0.8rem; font-weight:600; color:#f8fafc;">Üretilen SQL Komutu (UPDATE):</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" id="btn-toggle-sql-edit" class="btn-xs btn-outline-sql" title="SQL komutunu el ile düzenle">
                <i data-lucide="code" width="12" height="12"></i> <span id="btn-sql-edit-text">SQL Düzenle</span>
              </button>
              <button type="button" id="btn-copy-sql-preview" class="btn-xs btn-outline-sql" title="SQL Komutunu Kopyala">
                <i data-lucide="copy" width="12" height="12"></i> Kopyala
              </button>
            </div>
          </div>

          <!-- Read-only SQL Preview -->
          <div id="sql-preview-box" class="sql-preview-box">
            <code id="sql-preview-code">UPDATE ...</code>
          </div>

          <!-- Editable Custom SQL Textarea (Matching SqlQueryConsole style) -->
          <div id="sql-editable-box" class="sql-editable-box hidden">
            <textarea id="cell-sql-custom-input" class="sql-console-textarea" rows="3" spellcheck="false" placeholder="SQL sorgusunu düzenleyin..."></textarea>
          </div>

          <!-- SQL Runtime Execution Response Message Box -->
          <div id="sql-response-card" class="sql-response-card hidden">
            <div class="sql-response-header">
              <div style="display:flex; align-items:center; gap:8px;">
                <span id="sql-response-badge" class="badge type-table">MySQL Yanıtı</span>
                <span id="sql-response-time" style="font-size:0.75rem; opacity:0.8;">⚡ 0 ms</span>
              </div>
              <button type="button" id="btn-close-sql-response" class="btn-xs btn-outline-null" style="font-size:0.85rem; padding:0 4px;" title="Kapat">&times;</button>
            </div>
            <div id="sql-response-body" class="sql-response-body"></div>
          </div>
        </div>

      </div>

      <div class="modal-actions">
        <button type="button" id="btn-cell-edit-copy" class="btn btn-secondary">
          <i data-lucide="copy" width="14" height="14"></i> Kopyala
        </button>
        <button type="button" id="btn-cell-edit-cancel" class="btn btn-secondary">İptal</button>
        <button type="button" id="btn-cell-edit-save" class="btn btn-primary">
          <i data-lucide="play" width="14" height="14"></i>
          <span id="btn-save-text">SQL Çalıştır ve Kaydet</span>
        </button>
      </div>
    </div>
  `;

  const parentEl = document.fullscreenElement || document.body;
  parentEl.appendChild(editModalEl);
  refreshIcons();

  const closeBtn = editModalEl.querySelector('#btn-cell-edit-close');
  const cancelBtn = editModalEl.querySelector('#btn-cell-edit-cancel');
  const copyBtn = editModalEl.querySelector('#btn-cell-edit-copy');
  const saveBtn = editModalEl.querySelector('#btn-cell-edit-save');
  const nullBtn = editModalEl.querySelector('#btn-cell-set-null');
  const toggleModeBtn = editModalEl.querySelector('#btn-cell-toggle-mode');
  const toggleSqlEditBtn = editModalEl.querySelector('#btn-toggle-sql-edit');
  const copySqlBtn = editModalEl.querySelector('#btn-copy-sql-preview');
  const closeResponseBtn = editModalEl.querySelector('#btn-close-sql-response');
  const textarea = editModalEl.querySelector('#cell-edit-input');
  const customSqlInput = editModalEl.querySelector('#cell-sql-custom-input');

  if (closeBtn) closeBtn.addEventListener('click', hideEditModal);
  if (cancelBtn) cancelBtn.addEventListener('click', hideEditModal);

  if (closeResponseBtn) {
    closeResponseBtn.addEventListener('click', () => {
      const responseCard = editModalEl.querySelector('#sql-response-card');
      if (responseCard) responseCard.classList.add('hidden');
    });
  }

  if (toggleModeBtn) {
    toggleModeBtn.addEventListener('click', () => {
      isRawMode = !isRawMode;
      updateEditorModeUI();
    });
  }

  if (toggleSqlEditBtn) {
    toggleSqlEditBtn.addEventListener('click', () => {
      isSqlEditMode = !isSqlEditMode;
      updateSqlEditModeUI();
    });
  }

  if (copySqlBtn) {
    copySqlBtn.addEventListener('click', () => {
      const sql = getFinalSqlStatement();
      navigator.clipboard.writeText(sql).then(() => {
        showToast('SQL komutu panoya kopyalandı!');
      });
    });
  }

  if (nullBtn) {
    nullBtn.addEventListener('click', () => {
      if (activeCellInfo) {
        activeCellInfo.currentEditVal = '';
        activeCellInfo.currentIsNull = true;
      }
      if (textarea) {
        textarea.value = '';
        textarea.dataset.isNull = 'true';
      }
      renderSmartControl(activeCellInfo);
      updateCharCountUI();
      updateSqlPreviewUI();
      showToast('Hücre değeri NULL olarak ayarlandı.');
    });
  }

  if (textarea) {
    textarea.addEventListener('input', () => {
      if (activeCellInfo) {
        activeCellInfo.currentEditVal = textarea.value;
        activeCellInfo.currentIsNull = false;
      }
      updateCharCountUI();
      updateSqlPreviewUI();
    });
  }

  if (customSqlInput) {
    customSqlInput.addEventListener('input', () => {
      if (activeCellInfo) {
        activeCellInfo.customSql = customSqlInput.value;
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const currentVal = getCurrentEditedValue();
      const copyText = currentVal.isNull ? 'null' : currentVal.val;
      navigator.clipboard.writeText(copyText).then(() => {
        showToast('Hücre verisi panoya kopyalandı!');
      });
    });
  }

  // Save / Execute SQL Action
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!activeCellInfo || !activeCellInfo.cell) {
        hideEditModal();
        return;
      }

      const sqlQuery = getFinalSqlStatement();
      const responseCard = editModalEl.querySelector('#sql-response-card');
      const responseBadge = editModalEl.querySelector('#sql-response-badge');
      const responseTime = editModalEl.querySelector('#sql-response-time');
      const responseBody = editModalEl.querySelector('#sql-response-body');

      if (responseCard) responseCard.classList.add('hidden');

      const btnSaveText = editModalEl.querySelector('#btn-save-text');
      const originalText = btnSaveText ? btnSaveText.textContent : 'SQL Çalıştır ve Kaydet';
      if (btnSaveText) btnSaveText.textContent = 'Çalıştırılıyor...';
      saveBtn.disabled = true;

      try {
        const targetSchema = state.currentSchema || activeCellInfo.schemaName || '';
        const res = await executeSqlQueryApi(sqlQuery, targetSchema);

        if (!res.success) {
          if (responseCard && responseBody) {
            responseCard.className = 'sql-response-card status-error';
            responseCard.classList.remove('hidden');
            if (responseBadge) responseBadge.innerHTML = `<i data-lucide="alert-triangle" width="12" height="12"></i> MySQL Hatası`;
            if (responseTime) responseTime.textContent = `⚡ ${res.executionTimeMs || 0} ms`;

            responseBody.innerHTML = `
              <div class="response-msg-error">
                <div style="font-weight:600; color:#dc2626; display:flex; align-items:center; gap:6px; font-size:0.85rem;">
                  <i data-lucide="alert-circle" width="15" height="15"></i> Sorgu Çalıştırılamadı
                </div>
                <div class="error-detail-box" style="margin-top:6px; font-family:var(--font-mono); font-size:0.8rem; background:rgba(220,38,38,0.08); padding:8px 10px; border-radius:6px; border:1px solid rgba(220,38,38,0.2); color:#b91c1c; word-break:break-all;">
                  ${escapeHtml(res.message || 'Bilinmeyen veritabanı hatası')}
                </div>
                <div style="margin-top:6px; font-size:0.75rem; color:var(--text-dim);">
                  💡 İpucu: Sorguyu "SQL Düzenle" butonuna basarak manuel olarak düzeltebilir veya verileri kontrol edebilirsiniz.
                </div>
              </div>
            `;
            refreshIcons();
          }
          return;
        }

        // Successfully executed query on MySQL database!
        const edited = getCurrentEditedValue();
        const td = activeCellInfo.cell;

        td.setAttribute('data-raw-value', edited.val);
        td.setAttribute('data-is-null', edited.isNull ? 'true' : 'false');

        const cellScroll = td.querySelector('.cell-scroll') || td;
        if (edited.isNull) {
          cellScroll.innerHTML = '<em style="color:var(--text-dim)">null</em>';
        } else {
          cellScroll.innerHTML = escapeHtml(edited.val);
        }

        if (responseCard && responseBody) {
          responseCard.className = 'sql-response-card status-success';
          responseCard.classList.remove('hidden');
          if (responseBadge) responseBadge.innerHTML = `<i data-lucide="check-circle-2" width="12" height="12"></i> MySQL Yanıtı: OK`;
          if (responseTime) responseTime.textContent = `⚡ ${res.executionTimeMs || 0} ms`;

          const affected = res.affectedRows !== undefined ? res.affectedRows : 1;
          responseBody.innerHTML = `
            <div class="response-msg-success">
              <div style="font-weight:600; color:#16a34a; display:flex; align-items:center; gap:6px; font-size:0.85rem;">
                <i data-lucide="check-circle" width="15" height="15"></i> ${escapeHtml(res.message || 'Sorgu başarıyla çalıştırıldı.')}
              </div>
              <div style="font-size:0.78rem; color:#15803d; margin-top:4px;">
                📊 Etkilenen Satır: <strong>${affected}</strong> | Çalıştırma Süresi: <strong>${res.executionTimeMs || 0} ms</strong>
              </div>
            </div>
          `;
          refreshIcons();
        }

        showToast(`SQL Çalıştırıldı! Satır güncellendi. (${res.executionTimeMs || 0} ms)`);

      } catch (err) {
        if (responseCard && responseBody) {
          responseCard.className = 'sql-response-card status-error';
          responseCard.classList.remove('hidden');
          if (responseBadge) responseBadge.innerHTML = `<i data-lucide="alert-triangle" width="12" height="12"></i> Sunucu Hatası`;
          if (responseTime) responseTime.textContent = `⚡ 0 ms`;

          responseBody.innerHTML = `
            <div class="response-msg-error">
              <div style="font-weight:600; color:#dc2626; display:flex; align-items:center; gap:6px; font-size:0.85rem;">
                <i data-lucide="alert-circle" width="15" height="15"></i> Bağlantı / Sunucu Hatası
              </div>
              <div class="error-detail-box" style="margin-top:6px; font-family:var(--font-mono); font-size:0.8rem; background:rgba(220,38,38,0.08); padding:8px 10px; border-radius:6px; border:1px solid rgba(220,38,38,0.2); color:#b91c1c; word-break:break-all;">
                ${escapeHtml(err.message)}
              </div>
            </div>
          `;
          refreshIcons();
        }
      } finally {
        saveBtn.disabled = false;
        if (btnSaveText) btnSaveText.textContent = originalText;
      }
    });
  }
}

/**
 * Show Cell Edit Modal with Smart Control & SQL Preview
 */
export function showCellEditModal(cellInfo) {
  if (!editModalEl) ensureEditModalDOM();

  const targetParent = document.fullscreenElement || document.body;
  if (editModalEl.parentElement !== targetParent) {
    targetParent.appendChild(editModalEl);
  }

  const columnMeta = getColumnMeta(cellInfo.tableName, cellInfo.colName);
  const pkColName = getTablePrimaryKey(cellInfo.tableName);
  const pkVal = getRowPrimaryKeyVal(cellInfo.cell, pkColName);

  const smartInfo = detectSmartEditorType(cellInfo.colName, cellInfo.rawValue, columnMeta);

  activeCellInfo = {
    ...cellInfo,
    columnMeta: columnMeta,
    pkColName: pkColName,
    pkVal: pkVal,
    smartInfo: smartInfo,
    currentEditVal: cellInfo.isNull ? '' : cellInfo.rawValue,
    currentIsNull: cellInfo.isNull,
    customSql: ''
  };

  isRawMode = false;
  isSqlEditMode = false;

  const colNameEl = editModalEl.querySelector('#cell-edit-col-name');
  const typeBadgeEl = editModalEl.querySelector('#cell-edit-type-badge');
  const textarea = editModalEl.querySelector('#cell-edit-input');
  const responseCard = editModalEl.querySelector('#sql-response-card');

  if (colNameEl) colNameEl.textContent = cellInfo.colName || 'Sütun';
  if (typeBadgeEl) typeBadgeEl.textContent = smartInfo.label || 'TEXT';
  if (responseCard) responseCard.classList.add('hidden');

  if (textarea) {
    textarea.value = activeCellInfo.currentIsNull ? '' : activeCellInfo.currentEditVal;
    textarea.dataset.isNull = activeCellInfo.currentIsNull ? 'true' : 'false';
  }

  renderSmartControl(activeCellInfo);
  updateEditorModeUI();
  updateSqlEditModeUI();
  updateCharCountUI();
  updateSqlPreviewUI();

  editModalEl.classList.remove('hidden');
  refreshIcons();
}

/**
 * Render Smart Editor Control according to detected column type
 */
function renderSmartControl(cellInfo) {
  const container = document.getElementById('smart-editor-container');
  if (!container) return;

  container.innerHTML = '';
  const { smartInfo, currentEditVal, currentIsNull } = cellInfo;
  const type = smartInfo.type;

  // 1. ENUM / SET Selectbox
  if (type === 'enum') {
    const options = smartInfo.options || [];
    let html = `<div class="smart-enum-wrapper">
      <select id="smart-enum-select" class="cell-edit-select">`;

    if (currentIsNull) {
      html += `<option value="" selected>-- NULL (Boş / Belirtilmemiş) --</option>`;
    } else if (!options.includes(currentEditVal) && currentEditVal) {
      html += `<option value="${escapeHtml(currentEditVal)}" selected>${escapeHtml(currentEditVal)} (Mevcut Değer)</option>`;
    }

    options.forEach(opt => {
      const selected = !currentIsNull && currentEditVal === opt ? 'selected' : '';
      html += `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(opt)}</option>`;
    });

    if (!currentIsNull && !options.includes(currentEditVal)) {
      html += `<option value="">-- NULL Yap --</option>`;
    }

    html += `</select>
      <div style="margin-top:6px; font-size:0.75rem; color:var(--text-dim);">
        💡 Tabloda tanımlı ENUM seçeneklerinden birini seçin.
      </div>
    </div>`;

    container.innerHTML = html;

    const selectEl = container.querySelector('#smart-enum-select');
    if (selectEl) {
      selectEl.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '') {
          cellInfo.currentEditVal = '';
          cellInfo.currentIsNull = true;
        } else {
          cellInfo.currentEditVal = val;
          cellInfo.currentIsNull = false;
        }
        updateCharCountUI();
        updateSqlPreviewUI();
      });
    }
  }
  // 2. DATE / DATETIME Picker
  else if (type === 'date' || type === 'datetime') {
    const isDt = type === 'datetime';
    let formattedVal = currentEditVal || '';

    if (isDt && formattedVal) {
      formattedVal = formattedVal.replace(' ', 'T');
    }

    let html = `<div class="cell-edit-date-wrapper">
      <input type="${isDt ? 'datetime-local' : 'date'}" id="smart-date-input" class="cell-edit-input-date" step="1" value="${escapeHtml(formattedVal)}">
      <button type="button" id="btn-date-now" class="btn btn-secondary btn-sm" title="Şu anki tarih ve saati yaz">
        <i data-lucide="clock" width="14" height="14"></i> ${isDt ? 'Şimdi' : 'Bugün'}
      </button>
    </div>
    <div style="margin-top:6px; font-size:0.75rem; color:var(--text-dim);">
      📅 Tarih seçici ile takvimden veya manuel değer belirleyebilirsiniz.
    </div>`;

    container.innerHTML = html;
    refreshIcons();

    const dateInput = container.querySelector('#smart-date-input');
    const nowBtn = container.querySelector('#btn-date-now');

    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        let val = e.target.value;
        if (isDt && val) {
          val = val.replace('T', ' ');
          if (val.length === 16) val += ':00';
        }
        cellInfo.currentEditVal = val;
        cellInfo.currentIsNull = !val;
        updateCharCountUI();
        updateSqlPreviewUI();
      });
    }

    if (nowBtn && dateInput) {
      nowBtn.addEventListener('click', () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        if (isDt) {
          const htmlVal = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
          dateInput.value = htmlVal;
          cellInfo.currentEditVal = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } else {
          const htmlVal = `${year}-${month}-${day}`;
          dateInput.value = htmlVal;
          cellInfo.currentEditVal = htmlVal;
        }
        cellInfo.currentIsNull = false;
        updateCharCountUI();
        updateSqlPreviewUI();
        showToast('Tarih güncellendi.');
      });
    }
  }
  // 3. BOOLEAN Segment Buttons
  else if (type === 'boolean') {
    const isTrue = !currentIsNull && (currentEditVal === '1' || currentEditVal.toLowerCase() === 'true');
    const isFalse = !currentIsNull && (currentEditVal === '0' || currentEditVal.toLowerCase() === 'false');

    let html = `<div class="cell-edit-bool-group">
      <button type="button" class="bool-btn ${isTrue ? 'active-true' : ''}" data-val="1">
        <i data-lucide="check-circle-2" width="16" height="16"></i> 1 (EVET / Active)
      </button>
      <button type="button" class="bool-btn ${isFalse ? 'active-false' : ''}" data-val="0">
        <i data-lucide="x-circle" width="16" height="16"></i> 0 (HAYIR / Passive)
      </button>
    </div>
    <div style="margin-top:6px; font-size:0.75rem; color:var(--text-dim);">
      🔘 Mantıksal (Boolean) değer seçiniz.
    </div>`;

    container.innerHTML = html;
    refreshIcons();

    container.querySelectorAll('.bool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        cellInfo.currentEditVal = val;
        cellInfo.currentIsNull = false;

        container.querySelectorAll('.bool-btn').forEach(b => {
          b.classList.remove('active-true', 'active-false');
        });
        if (val === '1') btn.classList.add('active-true');
        else btn.classList.add('active-false');

        updateCharCountUI();
        updateSqlPreviewUI();
      });
    });
  }
  // 4. JSON Editor
  else if (type === 'json') {
    let isValidJson = true;
    let jsonFormatted = currentEditVal;

    try {
      if (currentEditVal.trim()) {
        const parsed = JSON.parse(currentEditVal);
        jsonFormatted = JSON.stringify(parsed, null, 2);
      }
    } catch (e) {
      isValidJson = false;
    }

    let html = `<div class="json-editor-wrapper">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span id="json-valid-badge" class="badge ${isValidJson ? 'type-table' : 'type-view'}">${isValidJson ? '✅ Geçerli JSON' : '⚠️ Ham / Metin'}</span>
        <button type="button" id="btn-format-json" class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.75rem;">
          <i data-lucide="wand-2" width="12" height="12"></i> JSON Biçimlendir
        </button>
      </div>
      <textarea id="smart-json-textarea" class="cell-edit-textarea" rows="5" placeholder="JSON nesnesi veya dizisi...">${escapeHtml(jsonFormatted)}</textarea>
    </div>`;

    container.innerHTML = html;
    refreshIcons();

    const jsonTextarea = container.querySelector('#smart-json-textarea');
    const formatBtn = container.querySelector('#btn-format-json');
    const validBadge = container.querySelector('#json-valid-badge');

    if (jsonTextarea) {
      jsonTextarea.addEventListener('input', () => {
        const val = jsonTextarea.value;
        cellInfo.currentEditVal = val;
        cellInfo.currentIsNull = !val.trim();

        try {
          if (val.trim()) JSON.parse(val);
          if (validBadge) {
            validBadge.className = 'badge type-table';
            validBadge.textContent = '✅ Geçerli JSON';
          }
        } catch (e) {
          if (validBadge) {
            validBadge.className = 'badge type-view';
            validBadge.textContent = '⚠️ Geçersiz JSON';
          }
        }
        updateCharCountUI();
        updateSqlPreviewUI();
      });
    }

    if (formatBtn && jsonTextarea) {
      formatBtn.addEventListener('click', () => {
        try {
          const val = jsonTextarea.value;
          if (val.trim()) {
            const pretty = JSON.stringify(JSON.parse(val), null, 2);
            jsonTextarea.value = pretty;
            cellInfo.currentEditVal = pretty;
            if (validBadge) {
              validBadge.className = 'badge type-table';
              validBadge.textContent = '✅ Geçerli JSON';
            }
            updateSqlPreviewUI();
            showToast('JSON biçimlendirildi!');
          }
        } catch (err) {
          showToast('Geçersiz JSON formatı.');
        }
      });
    }
  }
  // 5. NUMBER Input
  else if (type === 'number') {
    let html = `<div class="smart-number-wrapper">
      <input type="number" id="smart-number-input" class="cell-edit-input-date" step="any" placeholder="Sayısal değer..." value="${escapeHtml(currentEditVal)}">
      <div style="margin-top:6px; font-size:0.75rem; color:var(--text-dim);">
        🔢 Sayısal değer giriniz.
      </div>
    </div>`;

    container.innerHTML = html;

    const numInput = container.querySelector('#smart-number-input');
    if (numInput) {
      numInput.addEventListener('input', (e) => {
        const val = e.target.value;
        cellInfo.currentEditVal = val;
        cellInfo.currentIsNull = val === '';
        updateCharCountUI();
        updateSqlPreviewUI();
      });
    }
  }
  // 6. Default TEXT / Textarea
  else {
    let html = `<textarea id="smart-text-textarea" class="cell-edit-textarea" rows="5" placeholder="Hücre verisi...">${escapeHtml(currentEditVal)}</textarea>`;
    container.innerHTML = html;

    const textTextarea = container.querySelector('#smart-text-textarea');
    if (textTextarea) {
      textTextarea.addEventListener('input', (e) => {
        cellInfo.currentEditVal = e.target.value;
        cellInfo.currentIsNull = false;
        updateCharCountUI();
        updateSqlPreviewUI();
      });
    }
  }
}

/**
 * Toggle Mode UI (Smart Control vs Raw Textarea)
 */
function updateEditorModeUI() {
  if (!editModalEl) return;

  const smartContainer = editModalEl.querySelector('#smart-editor-container');
  const rawContainer = editModalEl.querySelector('#raw-textarea-container');
  const toggleText = editModalEl.querySelector('#toggle-mode-text');
  const rawTextarea = editModalEl.querySelector('#cell-edit-input');

  if (isRawMode) {
    if (smartContainer) smartContainer.classList.add('hidden');
    if (rawContainer) rawContainer.classList.remove('hidden');
    if (toggleText) toggleText.textContent = 'Akıllı Editör Modu';

    if (rawTextarea && activeCellInfo) {
      rawTextarea.value = activeCellInfo.currentIsNull ? '' : activeCellInfo.currentEditVal;
    }
  } else {
    if (smartContainer) smartContainer.classList.remove('hidden');
    if (rawContainer) rawContainer.classList.add('hidden');
    if (toggleText) toggleText.textContent = 'Düz Metin Modu';
  }
}

/**
 * Toggle SQL Edit Mode UI
 */
function updateSqlEditModeUI() {
  if (!editModalEl) return;

  const sqlPreviewBox = editModalEl.querySelector('#sql-preview-box');
  const sqlEditableBox = editModalEl.querySelector('#sql-editable-box');
  const btnSqlEditText = editModalEl.querySelector('#btn-sql-edit-text');
  const customSqlInput = editModalEl.querySelector('#cell-sql-custom-input');

  if (isSqlEditMode) {
    if (sqlPreviewBox) sqlPreviewBox.classList.add('hidden');
    if (sqlEditableBox) sqlEditableBox.classList.remove('hidden');
    if (btnSqlEditText) btnSqlEditText.textContent = 'Önizleme Modu';

    const currentGenerated = generateUpdateSql(
      state.currentSchema,
      activeCellInfo?.tableName,
      activeCellInfo?.colName,
      activeCellInfo?.currentEditVal,
      activeCellInfo?.currentIsNull,
      activeCellInfo?.pkColName,
      activeCellInfo?.pkVal
    );

    if (customSqlInput) {
      if (!customSqlInput.value.trim() || customSqlInput.value === currentGenerated) {
        customSqlInput.value = activeCellInfo?.customSql || currentGenerated;
      }

      // Attach live syntax highlighter & autocompleter
      attachSqlHighlighter(customSqlInput);
      attachSqlAutocompleter(customSqlInput);

      customSqlInput.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => customSqlInput.focus(), 50);
    }
  } else {
    if (sqlPreviewBox) sqlPreviewBox.classList.remove('hidden');
    if (sqlEditableBox) sqlEditableBox.classList.add('hidden');
    if (btnSqlEditText) btnSqlEditText.textContent = 'SQL Düzenle';
  }
}

/**
 * Live Update of Generated SQL Statement Preview
 */
function updateSqlPreviewUI() {
  if (!editModalEl || !activeCellInfo) return;

  const previewCodeEl = editModalEl.querySelector('#sql-preview-code');
  const customSqlInput = editModalEl.querySelector('#cell-sql-custom-input');

  const generatedSql = generateUpdateSql(
    state.currentSchema,
    activeCellInfo.tableName,
    activeCellInfo.colName,
    activeCellInfo.currentEditVal,
    activeCellInfo.currentIsNull,
    activeCellInfo.pkColName,
    activeCellInfo.pkVal
  );

  if (previewCodeEl) {
    previewCodeEl.innerHTML = highlightSql(generatedSql);
  }

  if (customSqlInput && !isSqlEditMode) {
    customSqlInput.value = generatedSql;
    activeCellInfo.customSql = generatedSql;
  }
}

/**
 * Get current edited value from active mode
 */
function getCurrentEditedValue() {
  if (!activeCellInfo) return { val: '', isNull: false };

  if (isRawMode) {
    const rawTextarea = editModalEl?.querySelector('#cell-edit-input');
    if (rawTextarea) {
      const isNull = rawTextarea.dataset.isNull === 'true' || (!rawTextarea.value && activeCellInfo.currentIsNull);
      return { val: rawTextarea.value, isNull: isNull };
    }
  }

  return {
    val: activeCellInfo.currentEditVal || '',
    isNull: !!activeCellInfo.currentIsNull
  };
}

/**
 * Get Final SQL statement to execute
 */
function getFinalSqlStatement() {
  const customSqlInput = editModalEl?.querySelector('#cell-sql-custom-input');

  if (isSqlEditMode && customSqlInput && customSqlInput.value.trim()) {
    return customSqlInput.value.trim();
  }

  return generateUpdateSql(
    state.currentSchema,
    activeCellInfo?.tableName,
    activeCellInfo?.colName,
    activeCellInfo?.currentEditVal,
    activeCellInfo?.currentIsNull,
    activeCellInfo?.pkColName,
    activeCellInfo?.pkVal
  );
}

/**
 * Update Character Counter UI in Modal Footer
 */
function updateCharCountUI() {
  if (!editModalEl) return;

  const charCountEl = editModalEl.querySelector('#cell-edit-char-count');
  if (!charCountEl) return;

  const edited = getCurrentEditedValue();
  if (edited.isNull) {
    charCountEl.textContent = '0 karakter (NULL)';
  } else {
    charCountEl.textContent = `${edited.val.length} karakter`;
  }
}

/**
 * Hide Cell Edit Modal
 */
export function hideEditModal() {
  if (editModalEl) {
    editModalEl.classList.add('hidden');
  }
  document.querySelectorAll('.sql-autocomplete-popover').forEach(p => p.classList.add('hidden'));
}
