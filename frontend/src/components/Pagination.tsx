import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Determine the start and end of the displayed items
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, page + 2);

    if (page <= 3) {
      endPage = Math.min(5, totalPages);
    } else if (page >= totalPages - 2) {
      startPage = Math.max(1, totalPages - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  if (total === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-slate-900/40 border-t border-white/5 gap-4">
      <div className="flex items-center gap-4 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-200"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>entries</span>
        </div>
        <div className="hidden sm:block">
          Showing <span className="font-medium text-white">{startItem}</span> to <span className="font-medium text-white">{endItem}</span> of <span className="font-medium text-white">{total}</span> results
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {getPageNumbers().map((pageNum) => (
          <button
            key={pageNum}
            onClick={() => onPageChange(pageNum)}
            className={`min-w-[32px] h-8 rounded-lg text-sm font-medium transition-colors ${
              page === pageNum
                ? 'bg-blue-600 text-white border border-blue-500 shadow-lg shadow-blue-500/20'
                : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {pageNum}
          </button>
        ))}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
