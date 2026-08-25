/**
 * MySQL Tree Schema Finder - Genealogy Tree Component (Soy Ağacı)
 * Canva-like interactive canvas with Zoom, Pan, Drag-and-Drop Nodes, and SVG Arrows.
 */

import { state } from '../state.js';
import { refreshIcons, escapeHtml } from '../utils.js';

let currentRootTable = '';
let currentCallbacks = {};
let zoomScale = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let mouseStartX = 0;
let mouseStartY = 0;

let isDraggingNode = false;
let draggedNodeId = null;
let draggedNodeStartGraphX = 0;
let draggedNodeStartGraphY = 0;
let mouseStartNodeX = 0;
let mouseStartNodeY = 0;

let nodesMap = new Map();
let edgesList = [];

const CARD_WIDTH = 270;
const CARD_HEIGHT = 155;
const LEVEL_GAP_Y = 240;
const NODE_GAP_X = 60;

/**
 * Render Genealogy View for a specified table
 */
export function renderGenealogyView(tableName, callbacks = {}) {
  currentRootTable = tableName;
  currentCallbacks = callbacks;

  const container = document.getElementById('tab-genealogy');
  if (!container) return;

  // Build Hierarchy Data
  const { nodes, edges } = buildGenealogyTree(tableName);

  // Store in module scope
  nodesMap = new Map();
  nodes.forEach(n => nodesMap.set(n.id, n));
  edgesList = edges;

  // Render HTML Structure inside #tab-genealogy if not already created
  initGenealogyContainerDOM();

  // Render Cards in Nodes Layer
  renderNodeCards();

  // Render SVG Lines
  drawSvgLines();

  // Attach Canvas Event Listeners (Pan, Ctrl-Scroll Zoom, Controls)
  setupCanvasListeners();

  // Auto-Center / Fit View
  setTimeout(() => {
    fitCanvasView();
  }, 50);
}

/**
 * Build the tree hierarchy starting from rootTableName
 * Enforces cycle/duplicate detection:
 * - If a table has ALREADY been rendered higher/earlier in the hierarchy,
 *   mark it as duplicate (RED), render it as a leaf, and DO NOT recurse into its sub-tables.
 */
function buildGenealogyTree(rootTableName) {
  const nodes = [];
  const edges = [];
  const globalVisited = new Set();
  let nodeCounter = 0;

  function createNode(tableName, depth, isRoot, isDuplicate, foreignKeyInfo = null, relationType = 'child') {
    nodeCounter++;
    const nodeId = `gnode-${nodeCounter}`;
    return {
      id: nodeId,
      tableName,
      depth,
      isRoot,
      isDuplicate,
      foreignKeyInfo,
      relationType,
      children: [],
      x: 0,
      y: 60 + depth * LEVEL_GAP_Y,
      subtreeWidth: 0
    };
  }

  // Root node
  const rootNode = createNode(rootTableName, 0, true, false);
  globalVisited.add(rootTableName);
  nodes.push(rootNode);

  // Recursive tree expansion — sadece alt (bağımlı) tablolar gösterilir
  // Amaç: "Bu tabloyu drop etmek için önce hangi tablolar drop edilmeli?"
  function expandNode(parentNode, currentDepth) {
    if (currentDepth >= 5) return; // Safeguard max depth

    const relations = getRelationsForTable(parentNode.tableName);

    // Sadece alt tablolar (bu tabloya FK ile bağlı olanlar)
    const combined = [];
    relations.children.forEach(c => {
      combined.push({
        targetTable: c.childTable,
        foreignKeyInfo: `${c.childColumn} → ${c.parentColumn}`,
        relationType: 'child'
      });
    });

    // Aynı tabloyu bu seviyede birden fazla FK ile bağlantı varsa tekilleştir
    const targetMap = new Map();
    combined.forEach(item => {
      if (!targetMap.has(item.targetTable)) {
        targetMap.set(item.targetTable, item);
      }
    });

    targetMap.forEach((item, targetTable) => {
      // Bu tablo daha önce ağaçta ziyaret edildiyse döngü tespiti
      const isDup = globalVisited.has(targetTable);

      const childNode = createNode(targetTable, currentDepth + 1, false, isDup, item.foreignKeyInfo, item.relationType);
      parentNode.children.push(childNode);
      nodes.push(childNode);

      edges.push({
        id: `gedge-${parentNode.id}-${childNode.id}`,
        parentId: parentNode.id,
        childId: childNode.id,
        isDuplicate: isDup,
        foreignKeyInfo: item.foreignKeyInfo
      });

      if (!isDup) {
        globalVisited.add(targetTable);
        expandNode(childNode, currentDepth + 1);
      }
    });
  }

  expandNode(rootNode, 0);

  // Calculate layout X coordinates
  calculateSubtreeWidths(rootNode);
  assignXPositions(rootNode, 0);

  return { nodes, edges };
}

/**
 * Get relations for a given table from state or schema details
 */
function getRelationsForTable(tableName) {
  const parents = [];
  const children = [];

  if (state.treeData && Array.isArray(state.treeData.tables)) {
    const tableObj = state.treeData.tables.find(t => t.name === tableName);
    if (tableObj && tableObj.columns) {
      tableObj.columns.forEach(col => {
        if (col.isFk && col.foreignKey && col.foreignKey.targetTable) {
          if (!parents.some(p => p.parentTable === col.foreignKey.targetTable && p.sourceColumn === col.name)) {
            parents.push({
              sourceColumn: col.name,
              parentTable: col.foreignKey.targetTable,
              parentColumn: col.foreignKey.targetColumn,
              constraintName: col.foreignKey.constraintName || ''
            });
          }
        }
      });
    }

    state.treeData.tables.forEach(t => {
      if (t.columns) {
        t.columns.forEach(col => {
          if (col.isFk && col.foreignKey && col.foreignKey.targetTable === tableName) {
            if (!children.some(c => c.childTable === t.name && c.childColumn === col.name)) {
              children.push({
                childTable: t.name,
                childColumn: col.name,
                parentColumn: col.foreignKey.targetColumn,
                constraintName: col.foreignKey.constraintName || ''
              });
            }
          }
        });
      }
    });
  }

  // Fallback to currentRelations if inspecting current table
  if (tableName === state.currentTableName && state.currentRelations) {
    if (state.currentRelations.parents) {
      state.currentRelations.parents.forEach(p => {
        if (!parents.some(existing => existing.parentTable === p.parentTable)) {
          parents.push(p);
        }
      });
    }
    if (state.currentRelations.children) {
      state.currentRelations.children.forEach(c => {
        if (!children.some(existing => existing.childTable === c.childTable)) {
          children.push(c);
        }
      });
    }
  }

  return { parents, children };
}

/**
 * Bottom-up subtree width calculation
 */
function calculateSubtreeWidths(node) {
  if (!node.children || node.children.length === 0) {
    node.subtreeWidth = CARD_WIDTH + NODE_GAP_X;
    return node.subtreeWidth;
  }

  let total = 0;
  node.children.forEach(c => {
    total += calculateSubtreeWidths(c);
  });

  node.subtreeWidth = Math.max(CARD_WIDTH + NODE_GAP_X, total);
  return node.subtreeWidth;
}

/**
 * Top-down X positioning calculation
 */
function assignXPositions(node, leftX) {
  if (!node.children || node.children.length === 0) {
    node.x = leftX + (node.subtreeWidth - CARD_WIDTH) / 2;
    return;
  }

  let currLeft = leftX;
  node.children.forEach(c => {
    assignXPositions(c, currLeft);
    currLeft += c.subtreeWidth;
  });

  const firstChild = node.children[0];
  const lastChild = node.children[node.children.length - 1];
  const childrenCenterX = (firstChild.x + CARD_WIDTH / 2 + lastChild.x + CARD_WIDTH / 2) / 2;
  node.x = childrenCenterX - CARD_WIDTH / 2;
}

/**
 * Initialize DOM structure inside tab-genealogy pane
 */
function initGenealogyContainerDOM() {
  const container = document.getElementById('tab-genealogy');
  if (!container) return;

  container.innerHTML = `
    <div class="genealogy-wrapper">
      <!-- Controls Toolbar -->
      <div class="genealogy-controls-bar">
        <div class="controls-left">
          <button type="button" id="btn-genealogy-zoom-in" class="genealogy-btn btn-icon-only" title="Yakınlaştır (+)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <button type="button" id="btn-genealogy-zoom-out" class="genealogy-btn btn-icon-only" title="Uzaklaştır (-)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <span id="genealogy-zoom-badge" class="zoom-badge">100%</span>
          <div class="controls-divider"></div>
          <button type="button" id="btn-genealogy-reset" class="genealogy-btn" title="Görünümü Sıfırla">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            Sığdır
          </button>
        </div>

        <div class="controls-right">
          <div class="genealogy-legend">
            <span class="legend-item"><span class="legend-dot dot-root"></span> Drop Edilecek Tablo</span>
            <span class="legend-item"><span class="legend-dot dot-normal"></span> Önce Drop Edilmeli</span>
            <span class="legend-item"><span class="legend-dot dot-duplicate"></span> Tekrarlayan (Döngü)</span>
          </div>
          <span class="canva-hint-text"><strong>Scroll</strong> yakınlaştırır &middot; Sürükle gezinir &middot; Kart taşınır</span>
        </div>
      </div>

      <!-- Canvas Area -->
      <div id="genealogy-canvas-container" class="genealogy-canvas-container">
        <div id="genealogy-viewport" class="genealogy-viewport">
          <svg id="genealogy-svg-lines" class="genealogy-svg-layer">
            <defs>
              <marker id="arrow-normal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
              </marker>
              <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
              </marker>
            </defs>
          </svg>
          <div id="genealogy-nodes-layer" class="genealogy-nodes-layer"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Node Cards into DOM
 */
function renderNodeCards() {
  const nodesLayer = document.getElementById('genealogy-nodes-layer');
  if (!nodesLayer) return;

  nodesLayer.innerHTML = '';

  nodesMap.forEach(node => {
    const card = document.createElement('div');
    card.id = node.id;
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.style.width = `${CARD_WIDTH}px`;
    card.style.minHeight = `${CARD_HEIGHT}px`;

    let cardTypeClass = 'node-normal';
    if (node.isRoot) cardTypeClass = 'node-root';
    else if (node.isDuplicate) cardTypeClass = 'node-duplicate';

    card.className = `genealogy-node-card ${cardTypeClass}`;

    // Get column count if available
    let colCount = '';
    if (state.treeData && Array.isArray(state.treeData.tables)) {
      const tableObj = state.treeData.tables.find(t => t.name === node.tableName);
      if (tableObj && tableObj.columns) {
        colCount = tableObj.columns.length;
      }
    }

    let badgeHtml = '';
    if (node.isRoot) {
      badgeHtml = `<span class="gnode-badge badge-root"><i data-lucide="crown" width="10" height="10"></i> KÖK</span>`;
    } else if (node.isDuplicate) {
      badgeHtml = `<span class="gnode-badge badge-duplicate"><i data-lucide="alert-triangle" width="10" height="10"></i> DÖNGÜ</span>`;
    } else {
      badgeHtml = `<span class="gnode-badge badge-child"><i data-lucide="trash-2" width="10" height="10"></i> Önce Drop Et</span>`;
    }

    const colCountHtml = colCount !== '' ? `<span style="font-size:0.68rem;color:#94a3b8;font-family:var(--font-mono);margin-left:4px">${colCount} col</span>` : '';

    let fkInfoHtml = '';
    if (node.foreignKeyInfo) {
      fkInfoHtml = `<div class="gnode-fk-info"><i data-lucide="link-2" width="10" height="10"></i> <span title="${escapeHtml(node.foreignKeyInfo)}">${escapeHtml(node.foreignKeyInfo)}</span></div>`;
    }

    let duplicateNotice = '';
    if (node.isDuplicate) {
      duplicateNotice = `<div class="gnode-duplicate-msg"><i data-lucide="alert-circle" width="10" height="10" style="display:inline;vertical-align:middle;margin-right:3px"></i>Bu tablo daha önce gösterildiğinden döngü engellendi.</div>`;
    }

    card.innerHTML = `
      <div class="gnode-header">
        <div class="gnode-title-row">
          <span class="gnode-name" title="${escapeHtml(node.tableName)}">${escapeHtml(node.tableName)}</span>
          ${badgeHtml}
        </div>
        ${colCountHtml ? `<div style="padding:2px 14px 6px;">${colCountHtml}</div>` : ''}
      </div>
      <div class="gnode-body">
        ${fkInfoHtml}
        ${duplicateNotice}
        <div class="gnode-actions">
          <button type="button" class="btn-gnode-inspect" data-table="${escapeHtml(node.tableName)}">
            <i data-lucide="external-link" width="12" height="12"></i> Tabloya Git
          </button>
        </div>
      </div>
    `;

    // Action button event listener
    const btnInspect = card.querySelector('.btn-gnode-inspect');
    if (btnInspect) {
      btnInspect.addEventListener('click', (e) => {
        e.stopPropagation();
        const tblName = btnInspect.getAttribute('data-table');
        if (tblName && typeof currentCallbacks.onSelectTable === 'function') {
          let tableObj = null;
          if (state.treeData && state.treeData.tables) {
            tableObj = state.treeData.tables.find(t => t.name === tblName);
          }
          if (!tableObj) tableObj = { name: tblName };
          currentCallbacks.onSelectTable(tableObj);
        }
      });
    }

    // Node Dragging listeners
    card.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDraggingNode = true;
      draggedNodeId = node.id;
      mouseStartNodeX = e.clientX;
      mouseStartNodeY = e.clientY;
      draggedNodeStartGraphX = node.x;
      draggedNodeStartGraphY = node.y;
      card.classList.add('is-dragging');
      e.stopPropagation();
    });

    nodesLayer.appendChild(card);
  });

  refreshIcons();
}

/**
 * Render SVG Connecting Lines & Arrow Markers
 */
function drawSvgLines() {
  const svg = document.getElementById('genealogy-svg-lines');
  if (!svg) return;

  // Clear existing paths (keep defs)
  const existingPaths = svg.querySelectorAll('g.edge-group');
  existingPaths.forEach(g => g.remove());

  edgesList.forEach(edge => {
    const parentNode = nodesMap.get(edge.parentId);
    const childNode = nodesMap.get(edge.childId);
    if (!parentNode || !childNode) return;

    const px = parentNode.x + CARD_WIDTH / 2;
    const py = parentNode.y + CARD_HEIGHT;
    const cx = childNode.x + CARD_WIDTH / 2;
    const cy = childNode.y;

    const deltaY = Math.abs(cy - py);
    const cy1 = py + deltaY * 0.45;
    const cy2 = cy - deltaY * 0.45;

    const pathD = `M ${px} ${py} C ${px} ${cy1}, ${cx} ${cy2}, ${cx} ${cy}`;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'edge-group');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('class', edge.isDuplicate ? 'edge-line edge-duplicate' : 'edge-line edge-normal');
    path.setAttribute('marker-end', edge.isDuplicate ? 'url(#arrow-red)' : 'url(#arrow-normal)');

    g.appendChild(path);

    // Optional text label over line midpoint
    if (edge.foreignKeyInfo) {
      const midX = (px + cx) / 2;
      const midY = (py + cy) / 2;

      const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      textBg.setAttribute('x', midX - 50);
      textBg.setAttribute('y', midY - 10);
      textBg.setAttribute('width', 100);
      textBg.setAttribute('height', 20);
      textBg.setAttribute('rx', 4);
      textBg.setAttribute('class', edge.isDuplicate ? 'edge-label-bg edge-label-bg-dup' : 'edge-label-bg');

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', midY + 4);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', edge.isDuplicate ? 'edge-label-text edge-label-dup' : 'edge-label-text');
      text.textContent = edge.foreignKeyInfo;

      g.appendChild(textBg);
      g.appendChild(text);
    }

    svg.appendChild(g);
  });
}

/**
 * Setup canvas panning, zooming, node dragging, and button control events
 */
function setupCanvasListeners() {
  const container = document.getElementById('genealogy-canvas-container');
  const viewport = document.getElementById('genealogy-viewport');
  if (!container || !viewport) return;

  // 1. Pan Dragging
  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('.genealogy-node-card') || e.target.closest('button')) return;
    isPanning = true;
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    startPanX = panX;
    startPanY = panY;
    container.classList.add('is-panning');
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - mouseStartX;
      const dy = e.clientY - mouseStartY;
      panX = startPanX + dx;
      panY = startPanY + dy;
      updateViewportTransform();
    } else if (isDraggingNode && draggedNodeId) {
      const node = nodesMap.get(draggedNodeId);
      if (node) {
        const dx = (e.clientX - mouseStartNodeX) / zoomScale;
        const dy = (e.clientY - mouseStartNodeY) / zoomScale;
        node.x = draggedNodeStartGraphX + dx;
        node.y = draggedNodeStartGraphY + dy;

        const cardEl = document.getElementById(node.id);
        if (cardEl) {
          cardEl.style.left = `${node.x}px`;
          cardEl.style.top = `${node.y}px`;
        }
        drawSvgLines();
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      container.classList.remove('is-panning');
    }
    if (isDraggingNode) {
      if (draggedNodeId) {
        const cardEl = document.getElementById(draggedNodeId);
        if (cardEl) cardEl.classList.remove('is-dragging');
      }
      isDraggingNode = false;
      draggedNodeId = null;
    }
  });

  // 2. Ctrl + Scroll / Wheel Zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const newScale = Math.min(Math.max(zoomScale * zoomFactor, 0.25), 2.5);

    // Zoom centered around mouse cursor position
    panX = mouseX - (mouseX - panX) * (newScale / zoomScale);
    panY = mouseY - (mouseY - panY) * (newScale / zoomScale);
    zoomScale = newScale;

    updateViewportTransform();
  }, { passive: false });

  // 3. Toolbar Buttons
  const btnZoomIn = document.getElementById('btn-genealogy-zoom-in');
  const btnZoomOut = document.getElementById('btn-genealogy-zoom-out');
  const btnReset = document.getElementById('btn-genealogy-reset');

  if (btnZoomIn) {
    btnZoomIn.onclick = () => {
      zoomScale = Math.min(zoomScale * 1.2, 2.5);
      updateViewportTransform();
    };
  }

  if (btnZoomOut) {
    btnZoomOut.onclick = () => {
      zoomScale = Math.max(zoomScale / 1.2, 0.25);
      updateViewportTransform();
    };
  }

  if (btnReset) {
    btnReset.onclick = () => {
      fitCanvasView();
    };
  }
}

/**
 * Apply scale & translation to viewport element
 */
function updateViewportTransform() {
  const viewport = document.getElementById('genealogy-viewport');
  const zoomBadge = document.getElementById('genealogy-zoom-badge');

  if (viewport) {
    viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
  }
  if (zoomBadge) {
    zoomBadge.textContent = `${Math.round(zoomScale * 100)}%`;
  }
}

/**
 * Auto-center and fit all graph nodes inside container viewport
 */
export function fitCanvasView() {
  const container = document.getElementById('genealogy-canvas-container');
  if (!container || nodesMap.size === 0) return;

  const rect = container.getBoundingClientRect();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodesMap.forEach(node => {
    if (node.x < minX) minX = node.x;
    if (node.x + CARD_WIDTH > maxX) maxX = node.x + CARD_WIDTH;
    if (node.y < minY) minY = node.y;
    if (node.y + CARD_HEIGHT > maxY) maxY = node.y + CARD_HEIGHT;
  });

  const graphWidth = maxX - minX + 120;
  const graphHeight = maxY - minY + 120;

  const containerWidth = rect.width || 900;
  const containerHeight = rect.height || 600;

  const scaleX = containerWidth / graphWidth;
  const scaleY = containerHeight / graphHeight;
  zoomScale = Math.min(Math.max(Math.min(scaleX, scaleY) * 0.88, 0.35), 1.1);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  panX = containerWidth / 2 - centerX * zoomScale;
  panY = containerHeight / 2 - centerY * zoomScale;

  updateViewportTransform();
}
