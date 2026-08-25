/**
 * MySQL Tree Schema Finder - SQL Syntax Highlighter Component
 * Provides IntelliJ IDEA style syntax highlighting for SQL textareas and code blocks.
 */

import { state } from '../state.js';
import { escapeHtml } from '../utils.js';

// SQL Keywords Set
const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'CROSS', 'OUTER', 'ON', 'USING',
  'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC',
  'UNION', 'ALL', 'DISTINCT', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'SHOW', 'SCHEMAS', 'DATABASES', 'TABLES', 'DESCRIBE', 'EXPLAIN', 'TRUNCATE',
  'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'DATABASE', 'SCHEMA',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT', 'AUTO_INCREMENT',
  'VARCHAR', 'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'TEXT', 'DATETIME', 'TIMESTAMP', 'BOOLEAN', 'DECIMAL', 'FLOAT', 'DOUBLE', 'ENUM', 'SET',
  'ENGINE', 'CHARSET', 'COLLATE', 'IF', 'TRUE', 'FALSE'
]);

// SQL Standard Functions Set
const SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CONCAT', 'CONCAT_WS', 'COALESCE', 'IFNULL', 'NULLIF',
  'NOW', 'DATE_FORMAT', 'LOWER', 'UPPER', 'ROUND', 'SUBSTRING', 'SUBSTR', 'LENGTH',
  'YEAR', 'MONTH', 'DAY', 'CURDATE', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
  'DATE_ADD', 'DATE_SUB', 'DATEDIFF', 'TRIM', 'LTRIM', 'RTRIM', 'REPLACE', 'CAST', 'CONVERT'
]);

/**
 * Tokenize and highlight SQL text into HTML with IntelliJ IDEA dark theme classes
 * @param {string} sql 
 * @returns {string} HTML string with syntax highlighting spans
 */
export function highlightSql(sql) {
  if (!sql) return '';

  // Get known tables and columns from app state for smart identification
  const knownTables = new Set();
  const knownColumns = new Set();

  if (state.treeData && Array.isArray(state.treeData.tables)) {
    state.treeData.tables.forEach(t => {
      if (t.name) knownTables.add(t.name.toLowerCase());
      if (Array.isArray(t.columns)) {
        t.columns.forEach(c => {
          if (c.name) knownColumns.add(c.name.toLowerCase());
        });
      }
    });
  }

  // Token Regex matching:
  // 1. Comments: /* ... */ or -- ... or # ...
  // 2. Strings: '...' or "..." (with quote escapes)
  // 3. Backticked Identifiers: `...`
  // 4. Numbers: digits with optional decimals
  // 5. Operators & Punctuation: =, !=, <, >, <=, >=, +, -, *, /, %, commas, dots, parens, semicolons
  // 6. Words: identifiers / keywords / functions
  const tokenRegex = /(\/\*[\s\S]*?\*\/|--(?:[^\r\n]*)|\#(?:[^\r\n]*))|('(?:''|\\'|[^'])*'|"(?:""|\\"|[^"])*")|(`[^`]+`)|(\b\d+(?:\.\d+)?\b)|([=><!~+\-*\/%|,;.\(\)])|(\b[a-zA-Z_][a-zA-Z0-9_]*\b)/g;

  let result = '';
  let lastIndex = 0;
  let match;
  let prevKeyword = '';

  while ((match = tokenRegex.exec(sql)) !== null) {
    // Append whitespace/unmatched characters
    if (match.index > lastIndex) {
      result += escapeHtml(sql.substring(lastIndex, match.index));
    }

    const [full, comment, string, backtick, number, operator, word] = match;

    if (comment) {
      result += `<span class="sql-hl-comment">${escapeHtml(comment)}</span>`;
    } else if (string) {
      result += `<span class="sql-hl-string">${escapeHtml(string)}</span>`;
    } else if (backtick) {
      const cleanName = backtick.slice(1, -1).toLowerCase();
      let hlClass = 'sql-hl-backtick';
      if (knownTables.has(cleanName) || ['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'TRUNCATE'].includes(prevKeyword)) {
        hlClass = 'sql-hl-table';
      } else if (knownColumns.has(cleanName) || ['SELECT', 'WHERE', 'SET', 'ON', 'HAVING', 'BY'].includes(prevKeyword)) {
        hlClass = 'sql-hl-column';
      }
      result += `<span class="${hlClass}">${escapeHtml(backtick)}</span>`;
    } else if (number) {
      result += `<span class="sql-hl-number">${escapeHtml(number)}</span>`;
    } else if (operator) {
      result += `<span class="sql-hl-operator">${escapeHtml(operator)}</span>`;
    } else if (word) {
      const upperWord = word.toUpperCase();
      const lowerWord = word.toLowerCase();

      if (SQL_KEYWORDS.has(upperWord)) {
        result += `<span class="sql-hl-keyword">${escapeHtml(word)}</span>`;
        prevKeyword = upperWord;
      } else if (SQL_FUNCTIONS.has(upperWord)) {
        result += `<span class="sql-hl-function">${escapeHtml(word)}</span>`;
      } else if (knownTables.has(lowerWord) || ['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'TRUNCATE'].includes(prevKeyword)) {
        result += `<span class="sql-hl-table">${escapeHtml(word)}</span>`;
      } else if (knownColumns.has(lowerWord) || ['SELECT', 'WHERE', 'SET', 'ON', 'HAVING', 'BY', 'AND', 'OR'].includes(prevKeyword)) {
        result += `<span class="sql-hl-column">${escapeHtml(word)}</span>`;
      } else {
        result += `<span class="sql-hl-identifier">${escapeHtml(word)}</span>`;
      }
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < sql.length) {
    result += escapeHtml(sql.substring(lastIndex));
  }

  return result;
}

/**
 * Attach live syntax highlighter overlay to a SQL textarea element
 * @param {HTMLTextAreaElement} textarea 
 */
export function attachSqlHighlighter(textarea) {
  if (!textarea || textarea.dataset.highlighterAttached) return;
  textarea.dataset.highlighterAttached = 'true';

  // Check if container already exists
  let container = textarea.parentElement;
  if (!container || !container.classList.contains('sql-editor-container')) {
    container = document.createElement('div');
    container.className = 'sql-editor-container';

    // Insert container before textarea and move textarea inside container
    textarea.parentNode.insertBefore(container, textarea);
    container.appendChild(textarea);
  }

  // Create backdrop element
  const backdrop = document.createElement('div');
  backdrop.className = 'sql-editor-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const highlightContent = document.createElement('div');
  highlightContent.className = 'sql-editor-highlight';
  backdrop.appendChild(highlightContent);

  container.insertBefore(backdrop, textarea);

  // Synchronize scroll and content
  function syncScroll() {
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }

  function updateHighlight() {
    let text = textarea.value || '';
    // Append trailing space so caret scrolling matches bottom empty lines
    if (text.endsWith('\n')) {
      text += ' ';
    }
    highlightContent.innerHTML = highlightSql(text);
    syncScroll();
  }

  // Event Listeners
  textarea.addEventListener('input', updateHighlight);
  textarea.addEventListener('scroll', syncScroll);
  textarea.addEventListener('keyup', updateHighlight);

  // ResizeObserver to adjust backdrop if textarea size changes dynamically
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      syncScroll();
    });
    ro.observe(textarea);
  }

  // Initial highlight render
  updateHighlight();
}
