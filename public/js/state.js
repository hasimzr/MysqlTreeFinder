/**
 * MySQL Tree Schema Finder - Application State Store
 */

export const state = {
  credentials: null,
  schemas: [],
  currentSchema: '',
  treeData: null,
  selectedTable: null,
  searchQuery: '',
  isTextViewMode: false,
  currentTableName: '',
  currentRelations: null,
  history: [],      // Visited table objects history
  historyIndex: -1, // Current index in history array
  savedConnections: [],
  tablePagination: {
    page: 1,
    limit: 25,
    totalRows: 0,
    totalPages: 1
  }
};

export function resetHistory() {
  state.history = [];
  state.historyIndex = -1;
}

export function pushHistory(table) {
  const currentItem = state.history[state.historyIndex];
  if (!currentItem || currentItem.name !== table.name) {
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push(table);
    state.historyIndex = state.history.length - 1;
  }
}
