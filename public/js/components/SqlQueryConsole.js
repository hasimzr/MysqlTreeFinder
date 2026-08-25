/**
 * MySQL Tree Schema Finder - SQL Query Console Component
 */

import { state } from '../state.js';
import { escapeHtml, makeTableResizable, setupTableShiftScroll, refreshIcons, showToast } from '../utils.js';
import { executeSqlQueryApi } from '../services/apiService.js';
import { attachSqlAutocompleter } from './SqlAutocompleter.js';
import { attachSqlHighlighter } from './SqlHighlighter.js';

export function initSqlQueryConsole() {
  // Inline SQL Bar Listeners
  const toggleInlineBtn = document.getElementById('btn-toggle-inline-sql');
  const inlineContainer = document.getElementById('inline-sql-editor-container');
  const inlineInput = document.getElementById('inline-sql-input');
  const runInlineBtn = document.getElementById('btn-run-inline-sql');
  const resetInlineBtn = document.getElementById('btn-reset-inline-sql');

  if (inlineInput) {
    attachSqlHighlighter(inlineInput);
    attachSqlAutocompleter(inlineInput);
  }

  if (toggleInlineBtn && inlineContainer) {
    toggleInlineBtn.addEventListener('click', () => {
      const isHidden = inlineContainer.classList.contains('hidden');
      if (isHidden) {
        inlineContainer.classList.remove('hidden');
        if (inlineInput && !inlineInput.value.trim() && state.currentTableName) {
          const schema = state.currentSchema ? `\`${state.currentSchema}\`.` : '';
          inlineInput.value = `SELECT * FROM ${schema}\`${state.currentTableName}\` LIMIT 25;`;
          inlineInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (inlineInput) inlineInput.focus();
      } else {
        inlineContainer.classList.add('hidden');
      }
    });
  }

  if (runInlineBtn && inlineInput) {
    runInlineBtn.addEventListener('click', () => handleRunInlineQuery());
    inlineInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunInlineQuery();
      }
    });
  }

  if (resetInlineBtn && inlineInput) {
    resetInlineBtn.addEventListener('click', () => {
      if (state.currentTableName) {
        const schema = state.currentSchema ? `\`${state.currentSchema}\`.` : '';
        inlineInput.value = `SELECT * FROM ${schema}\`${state.currentTableName}\` LIMIT 25;`;
        inlineInput.dispatchEvent(new Event('input', { bubbles: true }));
        handleRunInlineQuery();
      }
    });
  }

  // Full Console SQL Listeners
  const consoleInput = document.getElementById('console-sql-input');
  const runConsoleBtn = document.getElementById('btn-run-console-sql');
  const clearConsoleBtn = document.getElementById('btn-clear-console-sql');
  const templatesSelect = document.getElementById('console-sql-templates');

  if (consoleInput) {
    attachSqlHighlighter(consoleInput);
    attachSqlAutocompleter(consoleInput);
  }

  if (runConsoleBtn && consoleInput) {
    runConsoleBtn.addEventListener('click', () => handleRunConsoleQuery());
    consoleInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunConsoleQuery();
      }
    });
  }

  if (clearConsoleBtn && consoleInput) {
    clearConsoleBtn.addEventListener('click', () => {
      consoleInput.value = '';
      consoleInput.dispatchEvent(new Event('input', { bubbles: true }));
      consoleInput.focus();
      const statusEl = document.getElementById('console-sql-status');
      if (statusEl) statusEl.classList.add('hidden');
      const resultsContainer = document.getElementById('console-sql-results-container');
      if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="sql-empty-hint">Sorguyu çalıştırmak için yukarıdaki editöre SQL komutunu yazıp <strong>Çalıştır</strong> butonuna basın.</div>';
      }
    });
  }

  if (templatesSelect && consoleInput) {
    templatesSelect.addEventListener('change', (e) => {
      const template = e.target.value;
      if (!template) return;
      const tbl = state.currentTableName || 'table_name';
      const formatted = template.replace(/{table}/g, `\`${tbl}\``);
      consoleInput.value = formatted;
      consoleInput.dispatchEvent(new Event('input', { bubbles: true }));
      consoleInput.focus();
      e.target.value = '';
    });
  }

  // Quick SQL chips click handler
  document.querySelectorAll('.sql-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (!consoleInput) return;
      const sqlSnippet = chip.dataset.sql;
      const tbl = state.currentTableName || 'table_name';
      const formatted = sqlSnippet.replace(/{table}/g, `\`${tbl}\``);

      const caret = consoleInput.selectionStart;
      const val = consoleInput.value;
      consoleInput.value = val.substring(0, caret) + formatted + val.substring(caret);
      consoleInput.focus();
      const newPos = caret + formatted.length;
      consoleInput.setSelectionRange(newPos, newPos);
      consoleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

/**
 * Handle Inline SQL Execution inside Veriler tab
 */
async function handleRunInlineQuery() {
  const inlineInput = document.getElementById('inline-sql-input');
  const container = document.getElementById('sample-data-container');
  const recordInfoEl = document.getElementById('table-record-info');

  if (!inlineInput || !inlineInput.value.trim()) {
    showToast('Lütfen geçerli bir SQL sorgusu girin.');
    return;
  }

  const queryText = inlineInput.value.trim();
  if (container) {
    container.innerHTML = '<div class="loading-state" style="padding:20px; color:var(--text-muted);">Sorgu çalıştırılıyor...</div>';
  }

  try {
    const res = await executeSqlQueryApi(queryText, state.currentSchema);

    if (!res.success) {
      if (container) {
        container.innerHTML = `<div class="sql-error-card" style="padding:20px; color:var(--accent-rose); background:rgba(220,38,38,0.06); border-radius:8px;">
          <strong>SQL Hatası:</strong> ${escapeHtml(res.message || 'Sorgu çalıştırılamadı')}
        </div>`;
      }
      return;
    }

    if (res.isSelect) {
      const rows = res.rows || [];
      if (recordInfoEl) {
        recordInfoEl.textContent = `Sorgu Sonucu: ${rows.length} kayıt (${res.executionTimeMs} ms)`;
      }

      if (rows.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">Sorgu sonucunda hiç kayıt dönmedi.</div>';
        return;
      }

      renderQueryResultsTable(rows, container);
      showToast(`${rows.length} kayıt getirildi (${res.executionTimeMs} ms)`);
    } else {
      if (recordInfoEl) {
        recordInfoEl.textContent = res.message;
      }
      container.innerHTML = `<div class="sql-success-card" style="padding:20px; color:var(--accent-emerald); background:rgba(22,163,74,0.06); border-radius:8px;">
        <i data-lucide="check-circle-2" width="16" height="16"></i> ${escapeHtml(res.message)}
      </div>`;
      refreshIcons();
      showToast(res.message);
    }
  } catch (err) {
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--accent-rose);">Hata: ${escapeHtml(err.message)}</div>`;
    }
  }
}

/**
 * Handle Console SQL Execution inside SQL Konsol tab
 */
async function handleRunConsoleQuery() {
  const consoleInput = document.getElementById('console-sql-input');
  const statusEl = document.getElementById('console-sql-status');
  const resultsContainer = document.getElementById('console-sql-results-container');

  if (!consoleInput || !consoleInput.value.trim()) {
    showToast('Lütfen bir SQL sorgusu yazın.');
    return;
  }

  const queryText = consoleInput.value.trim();

  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.className = 'sql-status-bar status-loading';
    statusEl.innerHTML = '<span class="spinner-sm"></span> Sorgu çalıştırılıyor...';
  }

  if (resultsContainer) {
    resultsContainer.innerHTML = '<div class="loading-state" style="padding:20px; color:var(--text-muted);">Sorgu çalıştırılıyor...</div>';
  }

  try {
    const res = await executeSqlQueryApi(queryText, state.currentSchema);

    if (!res.success) {
      if (statusEl) {
        statusEl.className = 'sql-status-bar status-error';
        statusEl.innerHTML = `<i data-lucide="alert-circle" width="15" height="15"></i> <strong>Hata:</strong> ${escapeHtml(res.message)}`;
      }
      if (resultsContainer) {
        resultsContainer.innerHTML = `<div class="sql-error-box" style="padding:20px; color:var(--accent-rose); background:rgba(220,38,38,0.05); border-radius:8px; border:1px solid rgba(220,38,38,0.2);">
          <strong>SQL Hatası:</strong> ${escapeHtml(res.message)}
        </div>`;
      }
      refreshIcons();
      return;
    }

    // Success Status
    if (statusEl) {
      statusEl.className = 'sql-status-bar status-success';
      const icon = res.isSelect ? 'table' : 'check-circle-2';
      statusEl.innerHTML = `<i data-lucide="${icon}" width="15" height="15"></i> ${escapeHtml(res.message)}`;
    }

    if (res.isSelect) {
      const rows = res.rows || [];
      if (rows.length === 0) {
        resultsContainer.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">Sorgu sonucunda hiç kayıt bulunamadı.</div>';
      } else {
        renderQueryResultsTable(rows, resultsContainer);
      }
    } else {
      resultsContainer.innerHTML = `<div style="padding:30px; text-align:center; color:var(--accent-emerald);">
        <i data-lucide="check-circle" width="32" height="32" style="margin-bottom:8px;"></i>
        <h4 style="margin-bottom:4px;">Sorgu Başarıyla Çalıştırıldı</h4>
        <p style="color:var(--text-muted); font-size:0.9rem;">${escapeHtml(res.message)}</p>
      </div>`;
    }

    refreshIcons();
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'sql-status-bar status-error';
      statusEl.innerHTML = `<i data-lucide="alert-circle" width="15" height="15"></i> <strong>Hata:</strong> ${escapeHtml(err.message)}`;
    }
    if (resultsContainer) {
      resultsContainer.innerHTML = `<div style="padding:20px; color:var(--accent-rose);">Hata: ${escapeHtml(err.message)}</div>`;
    }
    refreshIcons();
  }
}

/**
 * Render SQL query results as interactive data table
 */
function renderQueryResultsTable(rows, targetContainer) {
  if (!targetContainer || !rows || rows.length === 0) return;

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
  targetContainer.innerHTML = tableHtml;

  const tableEl = targetContainer.querySelector('.data-table');
  if (tableEl) makeTableResizable(tableEl);
  setupTableShiftScroll(targetContainer);
}
