import React, { useState, useEffect } from 'react';
import { Book, Search, Plus, Filter, Edit2, Trash2, ArrowRightLeft, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';

interface BookType {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  status: string;
  totalCopies: number;
  availableCopies: number;
}

interface IssueType {
  id: string;
  bookTitle: string;
  studentName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  book?: { title: string };
  student?: { firstName: string; lastName: string };
}

export default function LibraryManagement() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'issues'>('catalog');
  const [books, setBooks] = useState<BookType[]>([]);
  const [totalBooks, setTotalBooks] = useState(0);
  const [issues, setIssues] = useState<IssueType[]>([]);
  const [totalIssues, setTotalIssues] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState(false);
  const [isIssueBookModalOpen, setIsIssueBookModalOpen] = useState(false);
  const [newBook, setNewBook] = useState({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
  const [issueData, setIssueData] = useState({ bookId: '', studentId: '', dueDate: '' });
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [bookToDelete, setBookToDelete] = useState<BookType | null>(null);
  const [deletingBook, setDeletingBook] = useState(false);
  const [issueToReturn, setIssueToReturn] = useState<IssueType | null>(null);
  const [returningBook, setReturningBook] = useState(false);
  const [savingBook, setSavingBook] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab, params.page, params.pageSize, debouncedSearch]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });
      if (debouncedSearch) {
        queryParams.append('search', debouncedSearch);
      }

      if (activeTab === 'catalog') {
        const booksRes = await apiClient.get(`/library/books?${queryParams.toString()}`);
        setBooks(booksRes.data.data?.books || booksRes.data.data || []);
        setTotalBooks(booksRes.data.data?.total || booksRes.data.meta?.total || 0);
      } else {
        const issuesRes = await apiClient.get(`/library/issues?${queryParams.toString()}`);
        setIssues(issuesRes.data.data?.issues || issuesRes.data.data || []);
        setTotalIssues(issuesRes.data.data?.total || issuesRes.data.meta?.total || 0);
      }
    } catch (error: any) {
      console.error('Failed to fetch library data:', error);
      toast.error(error.response?.data?.message || 'Failed to load library data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBook(true);
    try {
      if (editingBookId) {
        await apiClient.put(`/library/books/${editingBookId}`, newBook);
        toast.success('Book updated successfully');
      } else {
        await apiClient.post('/library/books', newBook);
        toast.success('Book added successfully');
      }
      setIsAddBookModalOpen(false);
      setEditingBookId(null);
      setNewBook({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to ${editingBookId ? 'update' : 'add'} book`);
    } finally {
      setSavingBook(false);
    }
  };

  const openEditBook = (book: BookType) => {
    setEditingBookId(book.id);
    setNewBook({ title: book.title, author: book.author, isbn: book.isbn, category: book.category, totalCopies: book.totalCopies });
    setIsAddBookModalOpen(true);
  };

  const openAddBook = () => {
    setEditingBookId(null);
    setNewBook({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
    setIsAddBookModalOpen(true);
  };

  const handleConfirmDeleteBook = async () => {
    if (!bookToDelete) return;
    setDeletingBook(true);
    try {
      await apiClient.delete(`/library/books/${bookToDelete.id}`);
      toast.success('Book deleted successfully');
      setBookToDelete(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete book');
    } finally {
      setDeletingBook(false);
    }
  };

  const handleIssueBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/library/issues', { ...issueData, issueDate: new Date().toISOString() });
      toast.success('Book issued successfully');
      setIsIssueBookModalOpen(false);
      setIssueData({ bookId: '', studentId: '', dueDate: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to issue book');
    }
  };

  const handleConfirmReturnBook = async () => {
    if (!issueToReturn) return;
    setReturningBook(true);
    try {
      await apiClient.put(`/library/issues/${issueToReturn.id}/return`);
      toast.success('Book returned successfully');
      setIssueToReturn(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to return book');
    } finally {
      setReturningBook(false);
    }
  };

  const issueColumns: Column<IssueType>[] = [
    {
      key: 'book',
      header: 'Book',
      sortable: false,
      render: (issue) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
            <Book className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-slate-900 dark:text-white">{issue.bookTitle || issue.book?.title}</span>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      sortable: false,
      render: (issue) => issue.studentName || `${issue.student?.firstName || ''} ${issue.student?.lastName || ''}`.trim(),
    },
    { key: 'issueDate', header: 'Issue Date', accessor: 'issueDate' },
    { key: 'dueDate', header: 'Due Date', accessor: 'dueDate' },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (issue) => <StatusBadge status={issue.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (issue) =>
        issue.status === 'Issued' ? (
          <button onClick={() => setIssueToReturn(issue)} aria-label="Return book" className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors" title="Return Book">
            <ArrowRightLeft className="w-4 h-4" />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Library Management</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Manage books, catalogs, and issuing.</p>
        </div>
        <button
          onClick={() => activeTab === 'catalog' ? openAddBook() : setIsIssueBookModalOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'catalog' ? 'Add Book' : 'Issue Book'}
        </button>
      </div>

      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 flex overflow-hidden bg-slate-50 dark:bg-slate-900/30 p-1 gap-1">
        <button
          onClick={() => { setActiveTab('catalog'); setSearch(''); }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'catalog'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
              : 'text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Book Catalog
        </button>
        <button
          onClick={() => { setActiveTab('issues'); setSearch(''); }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'issues'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
              : 'text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Issue Tracking
        </button>
      </div>

      {activeTab === 'catalog' && (
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search books by title, author, or ISBN..."
              className="input-field pl-10"
              value={params.search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white rounded-xl flex items-center gap-2 transition-colors font-medium text-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            Filter
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading...</div>
      ) : activeTab === 'catalog' ? (
        <div className="space-y-4">
          {books.length === 0 ? (
            <div className="glass-card p-8">
              <EmptyState
                title="No books in the catalog yet"
                description="Add a book to start building your library catalog."
                icon={<Book className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
                action={
                  <button
                    onClick={openAddBook}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl transition-all text-sm font-semibold"
                  >
                    <Plus className="w-4 h-4" /> Add Book
                  </button>
                }
              />
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {books.map((book) => (
            <div key={book.id} className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent group-hover:scale-110 transition-transform">
                  <Book className="w-6 h-6" />
                </div>
                <div className="flex gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    book.status === 'Available' 
                      ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' 
                      : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                  }`}>
                    {book.status}
                  </span>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">{book.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{book.author}</p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/50 dark:border-white/5">
                  <p className="text-xs text-slate-500 mb-1">Category</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold">{book.category}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/50 dark:border-white/5">
                  <p className="text-xs text-slate-500 mb-1">Copies</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold">{book.availableCopies} / {book.totalCopies}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-white/10">
                <span>ISBN: {book.isbn}</span>
                <div className="flex gap-2">
                   <button onClick={() => openEditBook(book)} aria-label={`Edit ${book.title}`} title="Edit book" className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                   <button onClick={() => setBookToDelete(book)} aria-label={`Delete ${book.title}`} title="Delete book" className="p-1 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
          </div>
          )}
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={totalBooks}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm p-4">
          <DataTable
            data={issues}
            columns={issueColumns}
            isLoading={loading}
            searchPlaceholder="Search issues by student or book..."
            serverSearch
            onSearch={setSearch}
            serverPagination
            totalCount={totalIssues}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyTitle="No book issues found"
            emptyDescription="Issue a book to a student to see it tracked here."
          />
        </div>
      )}

      {/* Add Book Modal */}
      {isAddBookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{editingBookId ? 'Edit Book' : 'Add New Book'}</h3>
              <button
                onClick={() => { setIsAddBookModalOpen(false); setEditingBookId(null); }}
                aria-label="Close"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddBook} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                <input required type="text" value={newBook.title} onChange={e => setNewBook({...newBook, title: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Author</label>
                <input required type="text" value={newBook.author} onChange={e => setNewBook({...newBook, author: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ISBN</label>
                <input required type="text" value={newBook.isbn} onChange={e => setNewBook({...newBook, isbn: e.target.value})} className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <input required type="text" value={newBook.category} onChange={e => setNewBook({...newBook, category: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Copies</label>
                  <input required type="number" min="1" value={newBook.totalCopies} onChange={e => setNewBook({...newBook, totalCopies: parseInt(e.target.value)})} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setIsAddBookModalOpen(false); setEditingBookId(null); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button type="submit" disabled={savingBook} className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm active:scale-[0.98] disabled:opacity-50">
                  {savingBook ? 'Saving...' : editingBookId ? 'Save Changes' : 'Add Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Book Modal */}
      {isIssueBookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Issue Book</h3>
              <button 
                onClick={() => setIsIssueBookModalOpen(false)} 
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleIssueBookSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Book ID</label>
                <input required type="text" value={issueData.bookId} onChange={e => setIssueData({...issueData, bookId: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Student ID</label>
                <input required type="text" value={issueData.studentId} onChange={e => setIssueData({...issueData, studentId: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
                <input required type="date" value={issueData.dueDate} onChange={e => setIssueData({...issueData, dueDate: e.target.value})} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsIssueBookModalOpen(false)} 
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm active:scale-[0.98]">Issue Book</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!bookToDelete}
        title="Delete book"
        message={`Are you sure you want to delete "${bookToDelete?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingBook}
        onConfirm={handleConfirmDeleteBook}
        onCancel={() => setBookToDelete(null)}
      />

      <ConfirmModal
        isOpen={!!issueToReturn}
        title="Return book"
        message={`Mark "${issueToReturn?.bookTitle || issueToReturn?.book?.title}" as returned?`}
        confirmLabel="Return Book"
        variant="info"
        isLoading={returningBook}
        onConfirm={handleConfirmReturnBook}
        onCancel={() => setIssueToReturn(null)}
      />
    </div>
  );
}
