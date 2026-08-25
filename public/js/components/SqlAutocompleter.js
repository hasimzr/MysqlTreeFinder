/**
 * MySQL Tree Schema Finder - SQL Autocompleter Component
 * Provides context-aware SQL auto-completion, ENUM values & Datepicker helpers for SQL textareas.
 */

import { state } from '../state.js';

// SQL Keywords List
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'CROSS JOIN', 'ON',
  'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'ASC', 'DESC', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL',
  'BETWEEN', 'EXISTS', 'UNION', 'UNION ALL', 'DISTINCT',
  'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'SHOW TABLES', 'SHOW SCHEMAS', 'DESCRIBE', 'TRUNCATE TABLE',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE'
];

// SQL Standard Functions
const SQL_FUNCTIONS = [
  { name: 'COUNT(*)', insertText: 'COUNT(*)', desc: 'Satır sayısını hesaplar' },
  { name: 'COUNT()', insertText: 'COUNT()', desc: 'Belirtilen sütundaki satırları sayar', cursorOffset: -1 },
  { name: 'SUM()', insertText: 'SUM()', desc: 'Toplam değeri hesaplar', cursorOffset: -1 },
  { name: 'AVG()', insertText: 'AVG()', desc: 'Ortalama değeri hesaplar', cursorOffset: -1 },
  { name: 'MAX()', insertText: 'MAX()', desc: 'En büyük değeri bulur', cursorOffset: -1 },
  { name: 'MIN()', insertText: 'MIN()', desc: 'En küçük değeri bulur', cursorOffset: -1 },
  { name: 'CONCAT()', insertText: 'CONCAT()', desc: 'Metinleri birleştirir', cursorOffset: -1 },
  { name: 'COALESCE()', insertText: 'COALESCE()', desc: 'İlk NULL olmayan değeri döner', cursorOffset: -1 },
  { name: 'IFNULL()', insertText: 'IFNULL()', desc: 'NULL ise alternatif değer döner', cursorOffset: -1 },
  { name: 'NOW()', insertText: 'NOW()', desc: 'Mevcut tarih ve saati verir' },
  { name: 'DATE_FORMAT()', insertText: 'DATE_FORMAT()', desc: 'Tarihi biçimlendirir', cursorOffset: -1 },
  { name: 'LOWER()', insertText: 'LOWER()', desc: 'Harfleri küçültür', cursorOffset: -1 },
  { name: 'UPPER()', insertText: 'UPPER()', desc: 'Harfleri büyütür', cursorOffset: -1 },
  { name: 'ROUND()', insertText: 'ROUND()', desc: 'Sayıyı yuvarlar', cursorOffset: -1 }
];

/**
 * Get column data type string safely from column metadata
 */
function getColumnTypeString(col) {
  if (!col) return '';
  return String(col.columnType || col.dataType || col.type || '').toLowerCase();
}

/**
 * Get raw column data type string (preserving case for ENUM value extraction)
 */
function getRawColumnTypeString(col) {
  if (!col) return '';
  return String(col.columnType || col.dataType || col.type || '');
}

/**
 * Extract enum/set values array from data type string e.g. enum('draft','published')
 */
function parseEnumValues(rawTypeStr) {
  if (!rawTypeStr) return [];
  const enumMatch = String(rawTypeStr).match(/(?:enum|set)\s*\((.*?)\)/i);
  if (!enumMatch || !enumMatch[1]) return [];

  const values = [];
  const valRegex = /'([^']*)'|"([^"]*)"/g;
  let m;
  while ((m = valRegex.exec(enumMatch[1])) !== null) {
    const val = m[1] !== undefined ? m[1] : m[2];
    if (val) values.push(val);
  }
  return values;
}

/**
 * Check if column is a primary key
 */
function isPrimaryKeyColumn(col) {
  if (!col) return false;
  return col.isPk === true || col.key === 'PRI' || col.COLUMN_KEY === 'PRI';
}

/**
 * Attach Autocompleter functionality to a textarea element
 * @param {HTMLTextAreaElement} textarea 
 */
export function attachSqlAutocompleter(textarea) {
  if (!textarea || textarea.dataset.autocompleterAttached) return;
  textarea.dataset.autocompleterAttached = 'true';

  // Create popup element
  const popover = document.createElement('div');
  popover.className = 'sql-autocomplete-popover hidden';
  const parentEl = document.fullscreenElement || document.body;
  parentEl.appendChild(popover);

  let activeIndex = 0;
  let currentSuggestions = [];
  let currentTokenInfo = null;

  // Key event handling
  textarea.addEventListener('keydown', (e) => {
    if (popover.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % currentSuggestions.length;
      updateActiveItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
      updateActiveItem();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      // If popup is open, accept suggestion
      if (currentSuggestions.length > 0) {
        e.preventDefault();
        applySuggestion(currentSuggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hidePopover();
    }
  });

  // Input listener for auto-triggering suggestions
  textarea.addEventListener('input', () => {
    evaluateAutocomplete();
  });

  textarea.addEventListener('click', () => {
    evaluateAutocomplete();
  });

  textarea.addEventListener('blur', () => {
    // Small delay to allow click event on popover items
    setTimeout(() => hidePopover(), 220);
  });

  window.addEventListener('resize', () => {
    if (!popover.classList.contains('hidden')) {
      positionPopover();
    }
  });

  window.addEventListener('scroll', () => {
    if (!popover.classList.contains('hidden')) {
      positionPopover();
    }
  }, true);

  /**
   * Evaluate autocomplete suggestions based on current caret position
   */
  function evaluateAutocomplete() {
    if (document.activeElement !== textarea) {
      hidePopover();
      return;
    }

    const text = textarea.value;
    const caretPos = textarea.selectionStart;

    const tokenInfo = getActiveToken(text, caretPos);
    if (!tokenInfo) {
      hidePopover();
      return;
    }

    currentTokenInfo = tokenInfo;
    currentSuggestions = generateSuggestions(tokenInfo, text);

    if (currentSuggestions.length === 0) {
      hidePopover();
      return;
    }

    activeIndex = 0;
    renderPopover();
    positionPopover();
  }

  /**
   * Render popover HTML
   */
  function renderPopover() {
    popover.innerHTML = '';

    // If Date context is active, render Datepicker Header bar inside popover
    if (currentSuggestions.isDateContext) {
      const dateBar = document.createElement('div');
      dateBar.className = 'ac-datepicker-bar';
      dateBar.innerHTML = `
        <label for="ac-date-input">📅 Takvimden Tarih Seç:</label>
        <input type="date" id="ac-date-input" class="ac-datepicker-input" />
      `;

      const dateInput = dateBar.querySelector('.ac-datepicker-input');
      dateInput.value = new Date().toISOString().split('T')[0];

      dateInput.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          applySuggestion({
            name: `'${val}'`,
            insertText: `'${val}'`
          });
        }
      });

      // Prevent losing focus from textarea on click
      dateBar.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      popover.appendChild(dateBar);
    }

    currentSuggestions.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = `sql-autocomplete-item ${index === activeIndex ? 'active' : ''}`;

      let typeBadge = '';
      if (item.type === 'KEYWORD') {
        typeBadge = `<span class="ac-badge ac-badge-kw">SQL</span>`;
      } else if (item.type === 'TABLE') {
        typeBadge = `<span class="ac-badge ac-badge-tbl">TABLO</span>`;
      } else if (item.type === 'COLUMN') {
        typeBadge = `<span class="ac-badge ac-badge-col">SÜTUN</span>`;
      } else if (item.type === 'FUNCTION') {
        typeBadge = `<span class="ac-badge ac-badge-fn">FONK</span>`;
      } else if (item.type === 'ENUM') {
        typeBadge = `<span class="ac-badge ac-badge-enum">ENUM</span>`;
      } else if (item.type === 'DATE') {
        typeBadge = `<span class="ac-badge ac-badge-date">TARİH</span>`;
      } else if (item.type === 'VALUE') {
        typeBadge = `<span class="ac-badge ac-badge-val">DEĞER</span>`;
      }

      const highlightedName = highlightMatch(item.name, currentTokenInfo.filterTerm);

      const displayDataType = item.displayDataType || item.dataType;
      let detailText = item.detail || '';
      if (displayDataType) {
        detailText = `<span class="ac-datatype" title="${escapeHtml(item.dataType || displayDataType)}">${escapeHtml(displayDataType)}</span> ${detailText}`;
      }
      if (item.isPrimaryKey) {
        detailText = `<span class="ac-pk-pill" title="Primary Key">🔑 PK</span> ${detailText}`;
      }

      let enumRowHtml = '';
      if (item.enumValues && item.enumValues.length > 0) {
        const chipsHtml = item.enumValues
          .slice(0, 6)
          .map(val => `<span class="ac-enum-chip">'${escapeHtml(val)}'</span>`)
          .join('');
        const moreHtml = item.enumValues.length > 6 ? `<span class="ac-enum-more">+${item.enumValues.length - 6} daha</span>` : '';
        enumRowHtml = `
          <div class="ac-enum-row">
            <span class="ac-enum-title">ENUM Değerleri:</span>
            <div class="ac-enum-chips">${chipsHtml}${moreHtml}</div>
          </div>
        `;
      }

      itemEl.innerHTML = `
        <div class="ac-item-top">
          <div class="ac-left">
            ${typeBadge}
            <span class="ac-name">${highlightedName}</span>
          </div>
          <div class="ac-right">${detailText}</div>
        </div>
        ${enumRowHtml}
      `;

      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applySuggestion(item);
      });

      itemEl.addEventListener('mouseenter', () => {
        activeIndex = index;
        updateActiveItem();
      });

      popover.appendChild(itemEl);
    });

    popover.classList.remove('hidden');
  }

  /**
   * Highlight current active item in scroll list
   */
  function updateActiveItem() {
    const items = popover.querySelectorAll('.sql-autocomplete-item');
    items.forEach((item, idx) => {
      if (idx === activeIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * Apply selected suggestion into textarea
   */
  function applySuggestion(item) {
    if (!item || !currentTokenInfo) return;

    const fullText = textarea.value;
    const insertVal = item.insertText || item.name;

    const before = fullText.substring(0, currentTokenInfo.start);
    const after = fullText.substring(currentTokenInfo.end);

    let newCursorPos = currentTokenInfo.start + insertVal.length;

    let suffix = '';
    if (item.type === 'KEYWORD' && !insertVal.endsWith('(')) {
      suffix = ' ';
      newCursorPos += 1;
    } else if (item.cursorOffset) {
      newCursorPos += item.cursorOffset;
    }

    textarea.value = before + insertVal + suffix + after;
    textarea.selectionStart = newCursorPos;
    textarea.selectionEnd = newCursorPos;
    textarea.focus();

    // Trigger input event for state listeners
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    hidePopover();
  }

  /**
   * Hide suggestions popover
   */
  function hidePopover() {
    popover.classList.add('hidden');
    currentSuggestions = [];
    activeIndex = 0;
  }

  /**
   * Position popover relative to textarea caret
   */
  function positionPopover() {
    if (!currentTokenInfo) return;

    const targetParent = document.fullscreenElement || document.body;
    if (popover.parentElement !== targetParent) {
      targetParent.appendChild(popover);
    }

    const coords = getCaretCoordinates(textarea, currentTokenInfo.start);

    const popoverWidth = 360;
    const popoverHeight = popover.offsetHeight || 240;

    let left = coords.left;
    let top = coords.top + coords.height + 4;

    // Boundary check right
    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 12);
    }

    // Boundary check bottom
    if (top + popoverHeight > window.innerHeight - 12) {
      top = Math.max(12, coords.top - popoverHeight - 4);
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
}

/**
 * Get word and context token at current caret index
 */
function getActiveToken(text, caretPos) {
  const textBeforeCaret = text.substring(0, caretPos);

  // Check if we are in a column value comparison context e.g. `status = ` or `school.status = 'AC`
  const valContextRegex = /(?:(?:`?([a-zA-Z0-9_]+)`?\.)?`?([a-zA-Z0-9_]+)`?)\s*(=|!=|<>|<|>|<=|>=|\bLIKE\b|\bIN\b\s*\(?|\bSET\b\s+)\s*(['"]?)([a-zA-Z0-9_\-:]*)$/i;
  const valMatch = textBeforeCaret.match(valContextRegex);

  if (valMatch) {
    const colName = valMatch[2];
    const upperCol = colName.toUpperCase();
    // Exclude general SQL keywords
    if (!['WHERE', 'AND', 'OR', 'SELECT', 'FROM', 'JOIN', 'LIMIT', 'ORDER', 'GROUP', 'BY', 'HAVING', 'ON'].includes(upperCol)) {
      const filterTerm = valMatch[5] || '';
      
      const start = textBeforeCaret.search(/(?:=|!=|<>|<|>|<=|>=|\bLIKE\b|\bIN\b|\bSET\b)\s*['"]?[a-zA-Z0-9_\-:]*$/i);
      const matchedOp = textBeforeCaret.match(/(?:=|!=|<>|<|>|<=|>=|\bLIKE\b|\bIN\b|\bSET\b)\s*['"]?/i);
      const actualStart = start !== -1 && matchedOp ? start + matchedOp[0].length : caretPos - filterTerm.length;

      return {
        word: filterTerm,
        rawWord: filterTerm,
        start: actualStart,
        end: caretPos,
        filterTerm: filterTerm.toLowerCase(),
        isValueContext: true,
        valMatch,
        textBeforeCaret
      };
    }
  }

  // Find standard active word boundaries (letters, numbers, underscores, dots, backticks)
  const wordRegex = /[`a-zA-Z0-9_\.]*$/;
  const match = textBeforeCaret.match(wordRegex);

  if (!match) return null;

  const rawWord = match[0];
  const start = caretPos - rawWord.length;
  const end = caretPos;

  // Clean quotes/backticks for filtering
  const cleanWord = rawWord.replace(/`/g, '');
  const isDotContext = cleanWord.includes('.');

  let tablePrefix = null;
  let filterTerm = cleanWord;

  if (isDotContext) {
    const parts = cleanWord.split('.');
    tablePrefix = parts[0];
    filterTerm = parts[1] || '';
  }

  return {
    word: cleanWord,
    rawWord,
    start,
    end,
    filterTerm: filterTerm.toLowerCase(),
    tablePrefix,
    isDotContext,
    textBeforeCaret
  };
}

/**
 * Generate suggestions based on token and context
 */
function generateSuggestions(tokenInfo, fullText) {
  const filter = tokenInfo.filterTerm;
  const suggestions = [];

  // Helper schema metadata
  const tables = (state.treeData && state.treeData.tables) ? state.treeData.tables : [];
  const currentTable = state.currentTableName || '';

  // 1. Column Value Context (ENUM values, DATE options, BOOLEAN values)
  if (tokenInfo.isValueContext && tokenInfo.valMatch) {
    const valCtx = detectColumnValueContext(tokenInfo.valMatch, fullText, tables);
    if (valCtx) {
      const valSuggestions = generateValueSuggestions(valCtx);
      if (valSuggestions.length > 0) {
        return valSuggestions;
      }
    }
  }

  const precedingText = tokenInfo.textBeforeCaret.substring(0, tokenInfo.start).toUpperCase().trim();
  const isAfterFromOrJoin = /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s*$/i.test(precedingText);
  const isAfterSelectOrWhere = /\b(SELECT|WHERE|AND|OR|ON|HAVING|SET|ORDER BY|GROUP BY|BY)\s*$/i.test(precedingText);

  // 2. Dot Context: user typed `tablename.col` or `alias.col`
  if (tokenInfo.isDotContext && tokenInfo.tablePrefix) {
    const targetTableName = resolveTableName(tokenInfo.tablePrefix, fullText, tables);
    const targetTableObj = tables.find(t => t.name.toLowerCase() === targetTableName.toLowerCase());

    if (targetTableObj && targetTableObj.columns) {
      targetTableObj.columns.forEach(col => {
        if (!filter || col.name.toLowerCase().includes(filter)) {
          const rawType = getRawColumnTypeString(col);
          const enumValues = parseEnumValues(rawType);
          let displayType = getColumnTypeString(col);
          if (enumValues.length > 0) {
            displayType = rawType.toLowerCase().startsWith('set') ? 'set' : 'enum';
          }

          suggestions.push({
            type: 'COLUMN',
            name: col.name,
            insertText: col.name,
            dataType: rawType,
            displayDataType: displayType,
            enumValues: enumValues,
            isPrimaryKey: isPrimaryKeyColumn(col),
            detail: `${targetTableObj.name}.${col.name}`,
            score: col.name.toLowerCase().startsWith(filter) ? 100 : 50
          });
        }
      });
    }
    return suggestions.sort((a, b) => b.score - a.score);
  }

  // 3. Keyword Suggestions
  SQL_KEYWORDS.forEach(kw => {
    const lowerKw = kw.toLowerCase();
    if (!filter || lowerKw.includes(filter)) {
      let score = 10;
      if (lowerKw.startsWith(filter)) score += 40;
      if (filter.length >= 2 && lowerKw.startsWith(filter)) score += 30;

      if (!isAfterFromOrJoin) score += 20;

      suggestions.push({
        type: 'KEYWORD',
        name: kw,
        insertText: kw,
        detail: 'SQL Komutu',
        score
      });
    }
  });

  // 4. Function Suggestions
  SQL_FUNCTIONS.forEach(fn => {
    const lowerFn = fn.name.toLowerCase();
    if (!filter || lowerFn.includes(filter)) {
      let score = 15;
      if (lowerFn.startsWith(filter)) score += 35;
      if (isAfterSelectOrWhere) score += 25;

      suggestions.push({
        type: 'FUNCTION',
        name: fn.name,
        insertText: fn.insertText,
        cursorOffset: fn.cursorOffset,
        detail: fn.desc,
        score
      });
    }
  });

  // 5. Table Suggestions
  tables.forEach(tbl => {
    const lowerTbl = tbl.name.toLowerCase();
    if (!filter || lowerTbl.includes(filter)) {
      let score = 20;
      if (lowerTbl.startsWith(filter)) score += 50;

      if (isAfterFromOrJoin) score += 60;
      if (currentTable && lowerTbl === currentTable.toLowerCase()) score += 25;

      suggestions.push({
        type: 'TABLE',
        name: tbl.name,
        insertText: `\`${tbl.name}\``,
        detail: `${tbl.type || 'TABLE'} (${tbl.columns ? tbl.columns.length : 0} sütun)`,
        score
      });
    }
  });

  // 6. Column Suggestions
  tables.forEach(tbl => {
    const isCurrent = currentTable && tbl.name.toLowerCase() === currentTable.toLowerCase();
    if (!tbl.columns) return;

    tbl.columns.forEach(col => {
      const lowerCol = col.name.toLowerCase();
      if (!filter || lowerCol.includes(filter)) {
        let score = 15;
        if (lowerCol.startsWith(filter)) score += 45;
        if (isCurrent) score += 40;
        if (isAfterSelectOrWhere) score += 30;

        const rawType = getRawColumnTypeString(col);
        const enumValues = parseEnumValues(rawType);
        let displayType = getColumnTypeString(col);
        if (enumValues.length > 0) {
          displayType = rawType.toLowerCase().startsWith('set') ? 'set' : 'enum';
        }

        const existing = suggestions.find(s => s.type === 'COLUMN' && s.name === col.name);
        if (!existing) {
          suggestions.push({
            type: 'COLUMN',
            name: col.name,
            insertText: `\`${col.name}\``,
            dataType: rawType,
            displayDataType: displayType,
            enumValues: enumValues,
            isPrimaryKey: isPrimaryKeyColumn(col),
            detail: `${tbl.name}.${col.name}`,
            score
          });
        } else if (isCurrent) {
          existing.score += 30;
          existing.detail = `${tbl.name}.${col.name}`;
          if (enumValues.length > 0) {
            existing.enumValues = enumValues;
            existing.displayDataType = displayType;
          }
        }
      }
    });
  });

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 14);
}

/**
 * Detect column value comparison context details
 */
function detectColumnValueContext(valMatch, fullText, tables) {
  const tablePrefix = valMatch[1] || null;
  const colName = valMatch[2];
  const operator = valMatch[3];
  const quote = valMatch[4] || '';
  const filterVal = valMatch[5] || '';

  let targetTable = null;
  if (tablePrefix) {
    const resolvedName = resolveTableName(tablePrefix, fullText, tables);
    targetTable = tables.find(t => t.name.toLowerCase() === resolvedName.toLowerCase());
  }

  if (!targetTable) {
    const fromMatch = fullText.match(/\b(?:FROM|UPDATE|INTO)\s+(?:`?[a-zA-Z0-9_]+`?\.)?`?([a-zA-Z0-9_]+)`?/i);
    if (fromMatch && fromMatch[1]) {
      targetTable = tables.find(t => t.name.toLowerCase() === fromMatch[1].toLowerCase());
    }
  }

  if (!targetTable && state.currentTableName) {
    targetTable = tables.find(t => t.name.toLowerCase() === state.currentTableName.toLowerCase());
  }

  let foundColumn = null;
  if (targetTable && targetTable.columns) {
    foundColumn = targetTable.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
  }

  if (!foundColumn) {
    for (const tbl of tables) {
      if (tbl.columns) {
        const col = tbl.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
        if (col) {
          foundColumn = col;
          targetTable = tbl;
          break;
        }
      }
    }
  }

  if (!foundColumn) return null;

  return {
    table: targetTable,
    column: foundColumn,
    colName,
    operator,
    quote,
    filterVal: filterVal.toLowerCase()
  };
}

/**
 * Generate Value suggestions for specific column types (ENUM, DATE, BOOLEAN, etc.)
 */
function generateValueSuggestions(valCtx) {
  const suggestions = [];
  const rawType = getRawColumnTypeString(valCtx.column);
  const type = rawType.toLowerCase();
  const filter = valCtx.filterVal;
  const quote = valCtx.quote;
  const tableName = valCtx.table ? valCtx.table.name : '';
  const colName = valCtx.colName;

  // 1. ENUM / SET Column
  if (type.includes('enum') || type.includes('set')) {
    const enumMatch = rawType.match(/(?:enum|set)\s*\((.*?)\)/i);
    if (enumMatch && enumMatch[1]) {
      const valRegex = /'([^']*)'|"([^"]*)"/g;
      let m;
      while ((m = valRegex.exec(enumMatch[1])) !== null) {
        const val = m[1] !== undefined ? m[1] : m[2];
        if (!filter || val.toLowerCase().includes(filter)) {
          const insertText = quote ? `${val}'` : `'${val}'`;
          suggestions.push({
            type: 'ENUM',
            name: `'${val}'`,
            insertText,
            detail: `ENUM Değeri (${tableName}.${colName})`,
            score: 350 + (val.toLowerCase().startsWith(filter) ? 50 : 0)
          });
        }
      }
    }
  }

  // 2. DATE / DATETIME / TIMESTAMP Column
  if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const firstOfMonth = today.substring(0, 8) + '01';

    const dateOptions = [
      { text: today, label: `'${today}'`, desc: 'Bugünün Tarihi' },
      { text: yesterdayDate, label: `'${yesterdayDate}'`, desc: 'Dünün Tarihi' },
      { text: firstOfMonth, label: `'${firstOfMonth}'`, desc: 'Ayın İlk Günü' },
      { text: 'NOW()', label: 'NOW()', desc: 'Mevcut Zaman (SQL)', noQuote: true },
      { text: 'CURRENT_DATE', label: 'CURRENT_DATE', desc: 'Bugünün Tarihi (SQL)', noQuote: true },
      { text: 'DATE_SUB(NOW(), INTERVAL 7 DAY)', label: 'Son 7 Gün', desc: 'Tarih Aralığı', noQuote: true },
      { text: 'DATE_SUB(NOW(), INTERVAL 30 DAY)', label: 'Son 30 Gün', desc: 'Tarih Aralığı', noQuote: true }
    ];

    dateOptions.forEach(opt => {
      if (!filter || opt.text.toLowerCase().includes(filter) || opt.label.toLowerCase().includes(filter)) {
        const insertText = opt.noQuote ? opt.text : (quote ? `${opt.text}'` : `'${opt.text}'`);
        suggestions.push({
          type: 'DATE',
          name: opt.label,
          insertText,
          detail: opt.desc,
          score: 300
        });
      }
    });

    suggestions.isDateContext = true;
  }

  // 3. BOOLEAN / TINYINT(1) Column
  if (type.includes('tinyint(1)') || type.includes('bool')) {
    const boolOpts = [
      { val: '1', label: '1 (TRUE / Aktif)' },
      { val: '0', label: '0 (FALSE / Pasif)' },
      { val: 'TRUE', label: 'TRUE' },
      { val: 'FALSE', label: 'FALSE' }
    ];

    boolOpts.forEach(b => {
      if (!filter || b.val.toLowerCase().includes(filter)) {
        suggestions.push({
          type: 'VALUE',
          name: b.label,
          insertText: b.val,
          detail: `${tableName}.${colName}`,
          score: 320
        });
      }
    });
  }

  // 4. Common Literals
  const generalOpts = [
    { val: 'NULL', label: 'NULL', desc: 'Boş Değer' },
    { val: 'IS NULL', label: 'IS NULL', desc: 'Boş Olanlar' },
    { val: 'IS NOT NULL', label: 'IS NOT NULL', desc: 'Boş Olmayanlar' }
  ];

  generalOpts.forEach(g => {
    if (!filter || g.val.toLowerCase().includes(filter)) {
      suggestions.push({
        type: 'VALUE',
        name: g.label,
        insertText: g.val,
        detail: g.desc,
        score: 200
      });
    }
  });

  return suggestions.sort((a, b) => b.score - a.score);
}

/**
 * Resolve table alias or prefix to full table name
 */
function resolveTableName(prefix, fullText, tables) {
  const cleanPrefix = prefix.toLowerCase();

  const directMatch = tables.find(t => t.name.toLowerCase() === cleanPrefix);
  if (directMatch) return directMatch.name;

  const aliasRegex = new RegExp(`(?:FROM|JOIN)\\s+\`?([a-zA-Z0-9_]+)\`?\\s+(?:AS\\s+)?\`?${cleanPrefix}\`?\\b`, 'i');
  const match = fullText.match(aliasRegex);
  if (match && match[1]) {
    return match[1];
  }

  return prefix;
}

/**
 * Highlight matched search substring inside suggestion label
 */
function highlightMatch(text, term) {
  if (!term) return escapeHtml(text);
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();

  const idx = lowerText.indexOf(lowerTerm);
  if (idx === -1) return escapeHtml(text);

  const start = text.substring(0, idx);
  const match = text.substring(idx, idx + term.length);
  const end = text.substring(idx + term.length);

  return `${escapeHtml(start)}<mark>${escapeHtml(match)}</mark>${escapeHtml(end)}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Mirror element caret coordinates calculator
 */
function getCaretCoordinates(element, position) {
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);

  const properties = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
    'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
    'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'whiteSpace', 'wordBreak'
  ];

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.top = '0px';
  div.style.left = '-9999px';

  properties.forEach(prop => {
    div.style[prop] = style[prop];
  });

  div.textContent = element.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);

  document.body.appendChild(div);
  const rect = element.getBoundingClientRect();

  const spanOffset = {
    top: rect.top + span.offsetTop - element.scrollTop,
    left: rect.left + span.offsetLeft - element.scrollLeft,
    height: span.offsetHeight || 18
  };

  document.body.removeChild(div);
  return spanOffset;
}
