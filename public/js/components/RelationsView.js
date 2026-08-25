/**
 * MySQL Tree Schema Finder - Table Relations Explorer Component (Card & Text Tree Views)
 */

import { state } from '../state.js';
import { refreshIcons } from '../utils.js';
import { fetchNestedRelationsApi } from '../services/apiService.js';
import { getTableHref } from '../router.js';

export function renderRelationsGrid(relations, currentTable, callbacks = {}) {
  const container = document.getElementById('relations-container');
  if (!container) return;

  container.innerHTML = '';

  const { onSelectTable } = callbacks;
  const parents = (relations && relations.parents) || [];
  const children = (relations && relations.children) || [];

  // Root Selected Table Branch Header
  const rootBranch = document.createElement('div');
  rootBranch.className = 'rel-branch';
  rootBranch.innerHTML = `
    <div class="rel-branch-header root-branch">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
      </svg>
      <span><i data-lucide="locate-fixed" width="16" height="16"></i> KÖK TABLO: <strong>${currentTable}</strong></span>
      <span class="rel-tag rel-tag-child" style="margin-left:auto;">AKTİF SEÇİM</span>
    </div>
  `;

  // 1. Üst Tablolar (Parent Tables) Branch Node
  const parentBranch = document.createElement('div');
  parentBranch.className = 'rel-branch';

  const parentHeader = document.createElement('div');
  parentHeader.className = 'rel-branch-header parent-branch';
  parentHeader.innerHTML = `
    <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform:rotate(90deg);"><polyline points="9 18 15 12 9 6"></polyline></svg>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="17 11 12 6 7 11"></polyline>
      <polyline points="17 18 12 13 7 18"></polyline>
    </svg>
    <span><i data-lucide="arrow-up-right" width="16" height="16"></i> Üst Tablolar (Referenced / Parent Tables)</span>
    <span class="node-datatype" style="margin-left:auto;">${parents.length} Tablo</span>
  `;

  const parentNodeList = document.createElement('div');
  parentNodeList.className = 'rel-node-list';

  if (parents.length === 0) {
    parentNodeList.innerHTML = `<div style="font-size:0.85rem; color:var(--text-dim); padding:8px 0;">Bu tablonun bağlı olduğu üst (parent) bir tablo bulunmuyor.</div>`;
  } else {
    parents.forEach(p => {
      const cardWrapper = createRelationCardElement(p, 'parent', [currentTable], currentTable, callbacks);
      parentNodeList.appendChild(cardWrapper);
    });
  }

  parentHeader.addEventListener('click', () => {
    parentNodeList.style.display = parentNodeList.style.display === 'none' ? 'flex' : 'none';
    const chevron = parentHeader.querySelector('.chevron');
    if (chevron) chevron.style.transform = parentNodeList.style.display === 'none' ? 'rotate(0deg)' : 'rotate(90deg)';
  });

  parentBranch.appendChild(parentHeader);
  parentBranch.appendChild(parentNodeList);

  // 2. Alt Tablolar (Child Tables) Branch Node
  const childBranch = document.createElement('div');
  childBranch.className = 'rel-branch';

  const childHeader = document.createElement('div');
  childHeader.className = 'rel-branch-header child-branch';
  childHeader.innerHTML = `
    <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform:rotate(90deg);"><polyline points="9 18 15 12 9 6"></polyline></svg>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="7 13 12 18 17 13"></polyline>
      <polyline points="7 6 12 11 17 6"></polyline>
    </svg>
    <span><i data-lucide="arrow-down-right" width="16" height="16"></i> Alt Tablolar (Dependent / Child Tables)</span>
    <span class="node-datatype" style="margin-left:auto;">${children.length} Tablo</span>
  `;

  const childNodeList = document.createElement('div');
  childNodeList.className = 'rel-node-list';

  if (children.length === 0) {
    childNodeList.innerHTML = `<div style="font-size:0.85rem; color:var(--text-dim); padding:8px 0;">Bu tabloya bağlı olan alt (child) bir tablo bulunmuyor.</div>`;
  } else {
    children.forEach(c => {
      const cardWrapper = createRelationCardElement(c, 'child', [currentTable], currentTable, callbacks);
      childNodeList.appendChild(cardWrapper);
    });
  }

  childHeader.addEventListener('click', () => {
    childNodeList.style.display = childNodeList.style.display === 'none' ? 'flex' : 'none';
    const chevron = childHeader.querySelector('.chevron');
    if (chevron) chevron.style.transform = childNodeList.style.display === 'none' ? 'rotate(0deg)' : 'rotate(90deg)';
  });

  childBranch.appendChild(childHeader);
  childBranch.appendChild(childNodeList);

  // Assemble Tree
  container.appendChild(rootBranch);
  container.appendChild(parentBranch);
  container.appendChild(childBranch);

  // Global Expand / Collapse Controls
  const btnRelExpand = document.getElementById('btn-rel-expand-all');
  const btnRelCollapse = document.getElementById('btn-rel-collapse-all');
  const textContainer = document.getElementById('relations-text-container');

  if (btnRelExpand) {
    btnRelExpand.onclick = async () => {
      if (state.isTextViewMode && textContainer) {
        let iteration = 0;
        while (iteration < 10) {
          const expandBtns = Array.from(textContainer.querySelectorAll('.rel-text-expand-btn:not(.is-expanded)'));
          if (expandBtns.length === 0) break;
          for (const btn of expandBtns) {
            await btn.click();
          }
          iteration++;
        }
      } else {
        parentNodeList.style.display = 'flex';
        childNodeList.style.display = 'flex';
        container.querySelectorAll('.chevron').forEach(ch => ch.style.transform = 'rotate(90deg)');

        const expandBtns = Array.from(container.querySelectorAll('.rel-toggle-expand-btn:not(.is-expanded)'));
        for (const btn of expandBtns) {
          btn.click();
        }
      }
    };
  }

  if (btnRelCollapse) {
    btnRelCollapse.onclick = () => {
      if (state.isTextViewMode && textContainer) {
        textContainer.querySelectorAll('.rel-text-nested-container').forEach(c => c.classList.add('hidden'));
        textContainer.querySelectorAll('.rel-text-expand-btn').forEach(btn => {
          btn.classList.remove('is-expanded');
          btn.innerHTML = `<span>Alt/Üst Aç</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        });
      } else {
        container.querySelectorAll('.rel-nested-tree').forEach(tree => {
          tree.classList.add('hidden');
        });
        container.querySelectorAll('.rel-toggle-expand-btn').forEach(btn => {
          btn.classList.remove('is-expanded');
          btn.innerHTML = `<span>Alt Tabloları Göster</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        });
        container.querySelectorAll('.rel-node-chevron').forEach(ch => {
          ch.classList.remove('expanded');
        });
        parentNodeList.style.display = 'none';
        childNodeList.style.display = 'none';
        container.querySelectorAll('.chevron').forEach(ch => ch.style.transform = 'rotate(0deg)');
      }
    };
  }
}

export function createRelationCardElement(item, type, ancestorPath, currentTableName, callbacks = {}) {
  const { onSelectTable } = callbacks;
  const isChild = type === 'child';
  const targetTable = isChild ? item.childTable : item.parentTable;

  const wrapper = document.createElement('div');
  wrapper.className = 'rel-card-wrapper';

  const card = document.createElement('div');
  card.className = 'rel-node-card';

  const tagClass = isChild ? 'rel-tag-child' : 'rel-tag-parent';
  const tagText = isChild ? 'ALT TABLO' : 'ÜST TABLO';
  const icon = isChild ? '<i data-lucide="corner-down-right" width="15" height="15"></i>' : '<i data-lucide="corner-up-right" width="15" height="15"></i>';
  const color = isChild ? 'var(--accent-cyan)' : 'var(--accent-amber)';

  const mappingText = isChild
    ? `${item.childTable}.${item.childColumn} <span style="color:var(--accent-cyan); font-weight:bold;"><i data-lucide="arrow-right" width="12" height="12"></i></span> ${currentTableName}.${item.parentColumn}`
    : `${currentTableName}.${item.sourceColumn} <span style="color:var(--accent-amber); font-weight:bold;"><i data-lucide="arrow-right" width="12" height="12"></i></span> ${item.parentTable}.${item.parentColumn}`;

  card.innerHTML = `
    <div class="rel-node-info">
      <div class="rel-node-title">
        <svg class="rel-node-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        <span style="color:${color};">${icon}</span>
        <a class="rel-table-name-link" href="${getTableHref(targetTable)}" title="${targetTable} tablosuna git">${targetTable}</a>
        <span class="rel-tag ${tagClass}">${tagText}</span>
      </div>
      <div class="rel-node-mapping">${mappingText}</div>
      <div class="rel-node-constraint">FK Constraint: ${item.constraintName || 'Foreign Key'}</div>
    </div>
    <div class="rel-card-actions">
      <button class="rel-toggle-expand-btn" data-target-table="${targetTable}">
        <span>Alt Tabloları Göster</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <a class="rel-jump-btn" href="${getTableHref(targetTable)}" title="Detay Sayfasına Git">
        <span>Tabloya Git</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </a>
    </div>
  `;

  const nestedTree = document.createElement('div');
  nestedTree.className = 'rel-nested-tree hidden';

  wrapper.appendChild(card);
  wrapper.appendChild(nestedTree);

  // Jump link event (normal click → JS navigation, Ctrl/mid-click → new tab)
  const jumpBtn = card.querySelector('.rel-jump-btn');
  jumpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Let Ctrl/Meta/middle-click open in new tab natively
    if (e.ctrlKey || e.metaKey || e.button === 1) return;
    e.preventDefault();
    if (state.treeData && state.treeData.tables) {
      const foundTable = state.treeData.tables.find(t => t.name === targetTable);
      if (typeof onSelectTable === 'function') {
        onSelectTable(foundTable || { name: targetTable, type: 'TABLE', columns: [] });
      }
    }
  });

  // Table name link event
  const tableNameLink = card.querySelector('.rel-table-name-link');
  if (tableNameLink) {
    tableNameLink.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.button === 1) return;
      e.preventDefault();
      if (state.treeData && state.treeData.tables) {
        const foundTable = state.treeData.tables.find(t => t.name === targetTable);
        if (typeof onSelectTable === 'function') {
          onSelectTable(foundTable || { name: targetTable, type: 'TABLE', columns: [] });
        }
      }
    });
  }

  // Expand Toggle event
  const toggleBtn = card.querySelector('.rel-toggle-expand-btn');
  const chevron = card.querySelector('.rel-node-chevron');

  const handleExpandToggle = async (e) => {
    if (e) e.stopPropagation();

    const isExpanded = !nestedTree.classList.contains('hidden');

    if (isExpanded) {
      nestedTree.classList.add('hidden');
      toggleBtn.classList.remove('is-expanded');
      toggleBtn.innerHTML = `<span>Alt Tabloları Göster</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      chevron.classList.remove('expanded');
    } else {
      nestedTree.classList.remove('hidden');
      toggleBtn.classList.add('is-expanded');
      toggleBtn.innerHTML = `<span>Alt Tabloları Gizle</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
      chevron.classList.add('expanded');

      if (!nestedTree.dataset.loaded) {
        await loadNestedRelations(targetTable, nestedTree, ancestorPath, callbacks);
      }
    }
  };

  toggleBtn.addEventListener('click', handleExpandToggle);
  chevron.addEventListener('click', handleExpandToggle);

  return wrapper;
}

export async function loadNestedRelations(tableName, containerElement, ancestorPath, callbacks = {}) {
  if (ancestorPath.includes(tableName)) {
    containerElement.dataset.loaded = 'true';
    containerElement.innerHTML = `
      <div class="rel-circular-alert">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>Döngüsel Bağlantı (Circular FK): <strong>${tableName}</strong> tablosu hiyerarşide zaten üst seviyede yer alıyor.</span>
      </div>
    `;
    return;
  }

  containerElement.innerHTML = `
    <div class="rel-nested-loading">
      <div class="btn-spinner" style="width:14px; height:14px;"></div>
      <span>${tableName} tablosunun alt/üst ilişkileri yükleniyor...</span>
    </div>
  `;

  try {
    const rels = await fetchNestedRelationsApi(tableName);
    const parents = rels.parents || [];
    const children = rels.children || [];

    containerElement.innerHTML = '';
    containerElement.dataset.loaded = 'true';

    const newAncestorPath = ancestorPath.concat(tableName);

    if (parents.length === 0 && children.length === 0) {
      containerElement.innerHTML = `<div style="font-size:0.8rem; color:var(--text-dim); padding:6px 0;">Bu tabloya ait başka bir alt/üst tablo ilişkisi bulunmamadı.</div>`;
      return;
    }

    const filteredParents = parents.filter(p => p.parentTable !== ancestorPath[ancestorPath.length - 1]);
    if (filteredParents.length > 0) {
      const pBranch = document.createElement('div');
      pBranch.className = 'rel-branch';
      pBranch.innerHTML = `<div class="rel-branch-header parent-branch" style="font-size:0.8rem; padding:4px 8px;"><span><i data-lucide="arrow-up-right" width="13" height="13"></i> Üst Tablolar (${filteredParents.length})</span></div>`;
      const pList = document.createElement('div');
      pList.className = 'rel-node-list';
      filteredParents.forEach(p => {
        pList.appendChild(createRelationCardElement(p, 'parent', newAncestorPath, tableName, callbacks));
      });
      pBranch.appendChild(pList);
      containerElement.appendChild(pBranch);
    }

    if (children.length > 0) {
      const cBranch = document.createElement('div');
      cBranch.className = 'rel-branch';
      cBranch.innerHTML = `<div class="rel-branch-header child-branch" style="font-size:0.8rem; padding:4px 8px;"><span><i data-lucide="arrow-down-right" width="13" height="13"></i> Alt Tablolar (${children.length})</span></div>`;
      const cList = document.createElement('div');
      cList.className = 'rel-node-list';
      children.forEach(c => {
        cList.appendChild(createRelationCardElement(c, 'child', newAncestorPath, tableName, callbacks));
      });
      cBranch.appendChild(cList);
      containerElement.appendChild(cBranch);
    }

  } catch (err) {
    containerElement.innerHTML = `<div style="font-size:0.8rem; color:var(--accent-rose); padding:6px 0;">Yükleme Hatası: ${err.message}</div>`;
  }
}

export function renderTextHierarchyView(relations, tableName, callbacks = {}) {
  const container = document.getElementById('relations-text-container');
  if (!container) return;
  container.innerHTML = '';

  const parents = (relations && relations.parents) || [];
  const children = (relations && relations.children) || [];

  const header = document.createElement('div');
  header.className = 'rel-text-header';
  header.innerHTML = `
    <div class="rel-text-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
      </svg>
      <span><i data-lucide="file-text" width="16" height="16"></i> Sade Metin Hiyerarşisi Ağacı: <strong>${tableName}</strong></span>
    </div>
    <div style="font-size:0.8rem; color:var(--text-dim);">Dinamik Hiyerarşik Metin Görünümü</div>
  `;

  const treeContainer = document.createElement('div');
  treeContainer.className = 'rel-text-tree-container';

  const ancestorPath = [tableName];

  if (parents.length > 0) {
    parents.forEach(p => {
      const node = createSingleTextNodeElement(p, 'parent', ancestorPath, tableName, callbacks);
      treeContainer.appendChild(node);
    });
  }

  const rootWrapper = document.createElement('div');
  rootWrapper.className = 'rel-text-node-wrapper';
  const rootItem = document.createElement('div');
  rootItem.className = 'rel-text-item';
  rootItem.style.borderLeft = '3px solid var(--primary)';
  rootItem.style.background = 'rgba(249, 115, 22, 0.08)';
  rootItem.innerHTML = `
    <span class="rel-text-indent-symbol"><i data-lucide="circle-dot" width="14" height="14" style="color:var(--primary);"></i></span>
    <span class="rel-text-table-name" style="color:var(--primary); font-size:0.95rem;">${tableName}</span>
    <span class="rel-text-relation-info">(Aktif Seçilen Kök Tablo)</span>
    <div class="rel-text-actions">
      <span class="rel-text-level-badge" style="background: rgba(249, 115, 22, 0.15); color: var(--primary);">KÖK TABLO</span>
    </div>
  `;
  rootWrapper.appendChild(rootItem);
  treeContainer.appendChild(rootWrapper);

  if (children.length > 0) {
    children.forEach(c => {
      const node = createSingleTextNodeElement(c, 'child', ancestorPath, tableName, callbacks);
      treeContainer.appendChild(node);
    });
  }

  if (parents.length === 0 && children.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.style.padding = '12px';
    emptyItem.style.color = 'var(--text-muted)';
    emptyItem.style.fontSize = '0.85rem';
    emptyItem.textContent = 'Bu tabloya bağlı üst (parent) veya alt (child) bir tablo bulunmuyor.';
    treeContainer.appendChild(emptyItem);
  }

  container.appendChild(header);
  container.appendChild(treeContainer);
}

export function createSingleTextNodeElement(item, type, ancestorPath, currentTableName, callbacks = {}) {
  const { onSelectTable } = callbacks;
  const isChild = type === 'child';
  const targetTable = isChild ? item.childTable : item.parentTable;

  const wrapper = document.createElement('div');
  wrapper.className = 'rel-text-node-wrapper';

  const card = document.createElement('div');
  card.className = 'rel-text-item';

  const tagText = isChild ? 'ALT TABLO' : 'ÜST TABLO';
  const tagBg = isChild ? 'rgba(2, 132, 199, 0.12)' : 'rgba(217, 119, 6, 0.12)';
  const tagColor = isChild ? 'var(--accent-cyan)' : 'var(--accent-amber)';
  const indentPrefix = isChild ? '└── <i data-lucide="arrow-down-right" width="13" height="13"></i>' : '├── <i data-lucide="arrow-up-right" width="13" height="13"></i>';

  const mappingText = isChild
    ? `${item.childTable}.${item.childColumn} <i data-lucide="arrow-right" width="12" height="12"></i> ${currentTableName}.${item.parentColumn}`
    : `${currentTableName}.${item.sourceColumn} <i data-lucide="arrow-right" width="12" height="12"></i> ${item.parentTable}.${item.parentColumn}`;

  card.innerHTML = `
    <span class="rel-text-indent-symbol">${indentPrefix}</span>
    <a class="rel-text-table-name" href="${getTableHref(targetTable)}" title="${targetTable} tablosunu aç">${targetTable}</a>
    <span class="rel-text-relation-info">(${mappingText})</span>
    <div class="rel-text-actions">
      <button class="rel-text-expand-btn" data-target-table="${targetTable}">
        <span>Alt/Üst Aç</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <span class="rel-text-level-badge" style="background:${tagBg}; color:${tagColor};">${tagText}</span>
    </div>
  `;

  const nestedContainer = document.createElement('div');
  nestedContainer.className = 'rel-text-nested-container hidden';

  wrapper.appendChild(card);
  wrapper.appendChild(nestedContainer);

  const expandBtn = card.querySelector('.rel-text-expand-btn');

  const handleExpandToggle = async (e) => {
    if (e) e.stopPropagation();

    const isExpanded = !nestedContainer.classList.contains('hidden');

    if (isExpanded) {
      nestedContainer.classList.add('hidden');
      expandBtn.classList.remove('is-expanded');
      expandBtn.innerHTML = `<span>Alt/Üst Aç</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    } else {
      nestedContainer.classList.remove('hidden');
      expandBtn.classList.add('is-expanded');
      expandBtn.innerHTML = `<span>Gizle</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>`;

      if (!nestedContainer.dataset.loaded) {
        await loadNestedTextRelations(targetTable, nestedContainer, ancestorPath, callbacks);
      }
    }
  };

  expandBtn.addEventListener('click', handleExpandToggle);

  // Table name link: normal click → JS, Ctrl/mid → new tab
  const tableNameLink = card.querySelector('.rel-text-table-name');
  if (tableNameLink) {
    tableNameLink.addEventListener('click', (e) => {
      if (e.target.closest('.rel-text-expand-btn')) return;
      if (e.ctrlKey || e.metaKey || e.button === 1) return;
      e.preventDefault();
      if (state.treeData && state.treeData.tables) {
        const found = state.treeData.tables.find(t => t.name === targetTable);
        if (typeof onSelectTable === 'function') {
          onSelectTable(found || { name: targetTable, type: 'TABLE', columns: [] });
        }
      }
    });
  }

  // Card click (for backward compat - clicking card body)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.rel-text-expand-btn')) return;
    if (e.target.closest('.rel-text-table-name')) return; // handled above
    if (state.treeData && state.treeData.tables) {
      const found = state.treeData.tables.find(t => t.name === targetTable);
      if (typeof onSelectTable === 'function') {
        onSelectTable(found || { name: targetTable, type: 'TABLE', columns: [] });
      }
    }
  });

  return wrapper;
}

export async function loadNestedTextRelations(tableName, containerElement, ancestorPath, callbacks = {}) {
  if (ancestorPath.includes(tableName)) {
    containerElement.dataset.loaded = 'true';
    containerElement.innerHTML = `
      <div style="font-size:0.78rem; color:var(--accent-amber); padding:4px 8px; font-family:var(--font-mono);">
        ⚠️ Döngüsel Bağlantı (Circular FK): <strong>${tableName}</strong>
      </div>
    `;
    return;
  }

  containerElement.innerHTML = `
    <div style="font-size:0.78rem; color:var(--text-dim); padding:4px 8px; font-family:var(--font-mono); display:flex; align-items:center; gap:6px;">
      <div class="btn-spinner" style="width:12px; height:12px;"></div>
      <span>${tableName} ilişkileri çekiliyor...</span>
    </div>
  `;

  try {
    const rels = await fetchNestedRelationsApi(tableName);
    const parents = rels.parents || [];
    const children = rels.children || [];

    containerElement.innerHTML = '';
    containerElement.dataset.loaded = 'true';

    const newAncestorPath = ancestorPath.concat(tableName);

    if (parents.length === 0 && children.length === 0) {
      containerElement.innerHTML = `<div style="font-size:0.78rem; color:var(--text-dim); padding:4px 0;">Başka alt/üst tablo ilişkisi bulunmuyor.</div>`;
      return;
    }

    const filteredParents = parents.filter(p => p.parentTable !== ancestorPath[ancestorPath.length - 1]);
    filteredParents.forEach(p => {
      containerElement.appendChild(createSingleTextNodeElement(p, 'parent', newAncestorPath, tableName, callbacks));
    });

    children.forEach(c => {
      containerElement.appendChild(createSingleTextNodeElement(c, 'child', newAncestorPath, tableName, callbacks));
    });

  } catch (err) {
    containerElement.innerHTML = `<div style="font-size:0.78rem; color:var(--accent-rose); padding:4px 0;">Yükleme Hatası: ${err.message}</div>`;
  }
}

export function updateRelationsViewMode(callbacks = {}) {
  const container = document.getElementById('relations-container');
  const textContainer = document.getElementById('relations-text-container');
  const btnRelToggleText = document.getElementById('btn-rel-toggle-text');

  if (state.isTextViewMode) {
    if (container) container.classList.add('hidden');
    if (textContainer) textContainer.classList.remove('hidden');
    if (btnRelToggleText) {
      btnRelToggleText.innerHTML = '<i data-lucide="layout-grid" width="14" height="14"></i> Kart Görünümü';
    }
    if (state.currentTableName && state.currentRelations) {
      renderTextHierarchyView(state.currentRelations, state.currentTableName, callbacks);
    }
  } else {
    if (container) container.classList.remove('hidden');
    if (textContainer) textContainer.classList.add('hidden');
    if (btnRelToggleText) {
      btnRelToggleText.innerHTML = '<i data-lucide="file-text" width="14" height="14"></i> Sade Metin Hiyerarşisi';
    }
  }
  refreshIcons();
}
