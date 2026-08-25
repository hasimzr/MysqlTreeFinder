/**
 * MySQL Tree Schema Finder - Schema Tree View Explorer Component
 */

import { state } from '../state.js';
import { refreshIcons } from '../utils.js';
import { getTableHref } from '../router.js';

export function renderTreeView(onSelectTable) {
  const treeView = document.getElementById('tree-view');
  const statsTables = document.getElementById('stats-tables-count');
  const statsColumns = document.getElementById('stats-columns-count');

  if (!treeView || !state.treeData) return;

  treeView.innerHTML = '';

  const rootSchemaNode = document.createElement('div');
  rootSchemaNode.className = 'tree-node expanded';

  // Root Schema Node Header
  const schemaContent = document.createElement('div');
  schemaContent.className = 'tree-node-content';
  schemaContent.innerHTML = `
    <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
    <span class="node-icon icon-schema">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
    </span>
    <span class="node-label"><strong>${state.treeData.schemaName}</strong></span>
    <span class="node-datatype">${state.treeData.tablesCount} tablo</span>
  `;

  // Schema Node Click Toggle
  schemaContent.addEventListener('click', () => {
    rootSchemaNode.classList.toggle('expanded');
  });

  rootSchemaNode.appendChild(schemaContent);

  // Children (Tables & Views) Container
  const tablesContainer = document.createElement('div');
  tablesContainer.className = 'tree-children';

  let totalColumnsCount = 0;

  state.treeData.tables.forEach(table => {
    totalColumnsCount += (table.columns ? table.columns.length : 0);

    // Check search query filter match
    const search = state.searchQuery.toLowerCase();
    const matchesTable = table.name.toLowerCase().includes(search);
    const matchingCols = table.columns ? table.columns.filter(c => c.name.toLowerCase().includes(search)) : [];

    if (search && !matchesTable && matchingCols.length === 0) {
      return; // Filter out if no match
    }

    const tableNode = document.createElement('div');
    tableNode.className = `tree-node ${search ? 'expanded' : ''}`;

    const isView = table.type === 'VIEW';
    const iconClass = isView ? 'icon-view' : 'icon-table';
    const iconSvg = isView
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`;

    const tableContent = document.createElement('a');
    tableContent.className = 'tree-node-content';
    tableContent.href = getTableHref(table.name);
    tableContent.innerHTML = `
      <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      <span class="node-icon ${iconClass}">${iconSvg}</span>
      <span class="node-label">${table.name}</span>
      <span class="node-datatype">${table.columns ? table.columns.length : 0} col</span>
    `;

    // Chevron Click -> Expand Columns
    const chevron = tableContent.querySelector('.chevron');
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      tableNode.classList.toggle('expanded');
    });

    // Table Row Click -> Open Details Panel (normal click stays in-page)
    tableContent.addEventListener('click', (e) => {
      // Allow Ctrl/Meta/middle-click to open in new tab natively
      if (e.ctrlKey || e.metaKey || e.button === 1) return;
      e.preventDefault();
      document.querySelectorAll('.tree-node-content').forEach(el => el.classList.remove('selected'));
      tableContent.classList.add('selected');
      if (typeof onSelectTable === 'function') {
        onSelectTable(table);
      }
    });

    tableNode.appendChild(tableContent);

    // Columns Children Container
    const columnsContainer = document.createElement('div');
    columnsContainer.className = 'tree-children';

    if (table.columns) {
      table.columns.forEach(col => {
        if (search && !matchesTable && !col.name.toLowerCase().includes(search)) {
          return; // Skip non-matching column when search active
        }

        const colNode = document.createElement('div');
        colNode.className = 'tree-node';

        let colIcon = '<span class="node-icon icon-column" title="Sütun"><i data-lucide="columns-3" width="12" height="12"></i></span>';
        if (col.isPk) {
          colIcon = '<span class="node-icon icon-pk" title="Primary Key"><i data-lucide="key-round" width="12" height="12"></i></span>';
        } else if (col.isFk) {
          colIcon = '<span class="node-icon icon-fk" title="Foreign Key"><i data-lucide="link-2" width="12" height="12"></i></span>';
        }

        const colContent = document.createElement('div');
        colContent.className = 'tree-node-content';
        colContent.innerHTML = `
          ${colIcon}
          <span class="node-label">${col.name}</span>
          <span class="node-datatype">${col.dataType}</span>
        `;

        colContent.addEventListener('click', () => {
          document.querySelectorAll('.tree-node-content').forEach(el => el.classList.remove('selected'));
          tableContent.classList.add('selected');
          if (typeof onSelectTable === 'function') {
            onSelectTable(table);
          }
        });

        colNode.appendChild(colContent);
        columnsContainer.appendChild(colNode);
      });
    }

    tableNode.appendChild(columnsContainer);
    tablesContainer.appendChild(tableNode);
  });

  rootSchemaNode.appendChild(tablesContainer);
  treeView.appendChild(rootSchemaNode);

  // Update Stats Footer
  if (statsTables) statsTables.textContent = `${state.treeData.tables.length} Tablo/Görünüm`;
  if (statsColumns) statsColumns.textContent = `${totalColumnsCount} Sütun`;

  refreshIcons();
}

export function setupSchemaTreeEvents(onSelectTable) {
  const btnExpandAll = document.getElementById('btn-expand-all');
  const btnCollapseAll = document.getElementById('btn-collapse-all');
  const searchInput = document.getElementById('tree-search-input');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const treeView = document.getElementById('tree-view');

  if (btnExpandAll) {
    btnExpandAll.addEventListener('click', () => {
      document.querySelectorAll('.tree-node').forEach(node => node.classList.add('expanded'));
    });
  }

  if (btnCollapseAll) {
    btnCollapseAll.addEventListener('click', () => {
      document.querySelectorAll('.tree-node').forEach(node => {
        if (treeView && treeView.firstChild && !node.contains(treeView.firstChild.firstChild)) {
          node.classList.remove('expanded');
        }
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      if (state.searchQuery && btnClearSearch) {
        btnClearSearch.classList.remove('hidden');
      } else if (btnClearSearch) {
        btnClearSearch.classList.add('hidden');
      }
      renderTreeView(onSelectTable);
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      state.searchQuery = '';
      btnClearSearch.classList.add('hidden');
      renderTreeView(onSelectTable);
    });
  }
}

export function highlightSidebarTable(tableName) {
  document.querySelectorAll('.tree-node-content').forEach(el => el.classList.remove('selected'));
  const allNodes = document.querySelectorAll('.tree-node-content');
  allNodes.forEach(node => {
    const labelEl = node.querySelector('.node-label');
    if (labelEl && labelEl.textContent.trim() === tableName) {
      node.classList.add('selected');
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}
