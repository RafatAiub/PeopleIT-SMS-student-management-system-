import { useState, useCallback, useEffect } from 'react';

export interface TableParams {
  page: number;
  pageSize: number;
  search: string;
  filters: Record<string, any>;
}

export const useTableParams = (initialPageSize = 10) => {
  const [params, setParams] = useState<TableParams>({
    page: 1,
    pageSize: initialPageSize,
    search: '',
    filters: {},
  });

  const [debouncedSearch, setDebouncedSearch] = useState(params.search);

  // Debounce search input to avoid hitting API on every keystroke
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(params.search);
      // Reset to page 1 on new search (only if search actually changed and we are past initialization)
      if (params.page !== 1) {
        setParams(prev => ({ ...prev, page: 1 }));
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [params.search]);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setParams((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search }));
  }, []);

  const setFilter = useCallback((key: string, value: any) => {
    setParams((prev) => ({
      ...prev,
      page: 1, // Reset page when filter changes
      filters: { ...prev.filters, [key]: value },
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setParams((prev) => ({ ...prev, filters: {}, page: 1, search: '' }));
  }, []);

  return {
    params,
    debouncedSearch,
    setPage,
    setPageSize,
    setSearch,
    setFilter,
    clearFilters,
  };
};
