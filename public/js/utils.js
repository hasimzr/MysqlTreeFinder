/**
 * MySQL Tree Schema Finder - UI Utilities & Helpers
 */

export function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

export function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function setupTableShiftScroll(wrapperElement) {
  if (!wrapperElement || wrapperElement.dataset.shiftScrollSetup) return;
  wrapperElement.dataset.shiftScrollSetup = 'true';

  wrapperElement.addEventListener('wheel', (e) => {
    if (e.shiftKey) {
      e.preventDefault();
      wrapperElement.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

export function makeTableResizable(tableElement) {
  if (!tableElement) return;

  // Enforce table-layout: fixed so th explicit widths strictly drive table column widths
  tableElement.style.tableLayout = 'fixed';

  const headers = Array.from(tableElement.querySelectorAll('thead th'));

  // 1. Column Resizing for Headers (th)
  headers.forEach((th) => {
    th.style.position = 'relative';

    // Ensure th has an explicit inline width initialized
    if (!th.style.width) {
      const computedW = th.getBoundingClientRect().width;
      const initialW = computedW > 0 ? Math.round(computedW) : 140;
      th.style.width = `${initialW}px`;
    }
    th.style.minWidth = '0px';

    let resizer = th.querySelector('.col-resizer');
    if (!resizer) {
      resizer = document.createElement('div');
      resizer.className = 'col-resizer';
      resizer.title = 'Sütun genişliğini değiştirmek için sürükleyin';
      th.appendChild(resizer);
    }

    setupColResizerEvents(resizer, th);
  });

  // 2. Column & Row Resizing for Body Cells (td)
  const rows = tableElement.querySelectorAll('tbody tr');
  rows.forEach((tr) => {
    const cells = tr.querySelectorAll('td');
    cells.forEach((td, cellIndex) => {
      td.style.position = 'relative';

      // Column Resizer on td (linked to corresponding th)
      const targetTh = headers[cellIndex];
      if (targetTh) {
        let colResizer = td.querySelector('.col-resizer');
        if (!colResizer) {
          colResizer = document.createElement('div');
          colResizer.className = 'col-resizer';
          colResizer.title = 'Sütun genişliğini değiştirmek için sürükleyin';
          td.appendChild(colResizer);
        }
        setupColResizerEvents(colResizer, targetTh);
      }

      // Row Resizer on td (resizes row height)
      let rowResizer = td.querySelector('.row-resizer');
      if (!rowResizer) {
        rowResizer = document.createElement('div');
        rowResizer.className = 'row-resizer';
        rowResizer.title = 'Satır yüksekliğini değiştirmek için sürükleyin';
        td.appendChild(rowResizer);
      }
      setupRowResizerEvents(rowResizer, tr);
    });
  });
}

function setupColResizerEvents(resizer, th) {
  if (resizer.dataset.colResizerSetup) return;
  resizer.dataset.colResizerSetup = 'true';

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = th.getBoundingClientRect().width || parseFloat(th.style.width) || 120;

    resizer.classList.add('is-resizing');
    document.body.classList.add('is-resizing-column');

    const onMouseMove = (moveEvent) => {
      const diffX = moveEvent.clientX - startX;
      const newWidth = Math.max(30, startWidth + diffX);
      th.style.width = `${newWidth}px`;
      th.style.minWidth = `${newWidth}px`;
    };

    const onMouseUp = () => {
      resizer.classList.remove('is-resizing');
      document.body.classList.remove('is-resizing-column');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function setupRowResizerEvents(resizer, tr) {
  if (resizer.dataset.rowResizerSetup) return;
  resizer.dataset.rowResizerSetup = 'true';

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = tr.getBoundingClientRect().height || 36;

    resizer.classList.add('is-resizing');
    document.body.classList.add('is-resizing-row');

    const onMouseMove = (moveEvent) => {
      const diffY = moveEvent.clientY - startY;
      const newHeight = Math.max(26, startHeight + diffY);
      tr.style.height = `${newHeight}px`;
    };

    const onMouseUp = () => {
      resizer.classList.remove('is-resizing');
      document.body.classList.remove('is-resizing-row');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
