import React, { useState, useEffect } from 'react';
import { Book, Search, Plus, Filter, MoreVertical, Edit2, Trash2, ArrowRightLeft, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';

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
    } catch (error) {
      console.error('Failed to fetch library data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/library/books', newBook);
      toast.success('Book added successfully');
      setIsAddBookModalOpen(false);
      setNewBook({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to add book');
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

  const handleReturnBook = async (issueId: string) => {
    try {
      await apiClient.put(`/library/issues/${issueId}/return`);
      toast.success('Book returned successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to return book');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Library Management</h2>
          <p className="text-slate-650 dark:text-slate-400 text-sm">Manage books, catalogs, and issuing.</p>
        </div>
        <button 
          onClick={() => activeTab === 'catalog' ? setIsAddBookModalOpen(true) : setIsIssueBookModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98]"
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
              : 'text-slate-450 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Book Catalog
        </button>
        <button
          onClick={() => { setActiveTab('issues'); setSearch(''); }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'issues'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
              : 'text-slate-450 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Issue Tracking
        </button>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-450" />
          <input
            type="text"
            placeholder={activeTab === 'catalog' ? "Search books by title, author, or ISBN..." : "Search issues by student or book..."}
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

      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading...</div>
      ) : activeTab === 'catalog' ? (
        <div className="space-y-4">
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
                  <button className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
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
                   <button className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                   <button className="p-1 text-slate-500 hover:text-rose-650 dark:hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={totalBooks}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 overflow-hidden shadow-sm bg-white dark:bg-transparent">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-slate-700 dark:text-slate-300">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-300">Book</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-300">Student</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-300">Issue Date</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-300">Due Date</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-300">Status</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {issues.map((issue) => (
                    <tr key={issue.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-650 dark:text-blue-400 border border-blue-200 dark:border-transparent">
                            <Book className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{issue.bookTitle || issue.book?.title}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-650 dark:text-slate-300">{issue.studentName || `${issue.student?.firstName || ''} ${issue.student?.lastName || ''}`.trim()}</td>
                      <td className="p-4 text-sm text-slate-500 dark:text-slate-400">{issue.issueDate}</td>
                      <td className="p-4 text-sm text-slate-500 dark:text-slate-400">{issue.dueDate}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          issue.status === 'Issued' 
                            ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20' 
                            : 'bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                        }`}>
                          {issue.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <button onClick={() => handleReturnBook(issue.id)} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-450 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors" title="Return Book">
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={totalIssues}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      {/* Add Book Modal */}
      {isAddBookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Add New Book</h3>
              <button 
                onClick={() => setIsAddBookModalOpen(false)} 
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
                  onClick={() => setIsAddBookModalOpen(false)} 
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm active:scale-[0.98]">Add Book</button>
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
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm active:scale-[0.98]">Issue Book</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
