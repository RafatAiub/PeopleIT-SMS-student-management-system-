import React, { useState, useEffect } from 'react';
import { Book, Search, Plus, Filter, MoreVertical, Edit2, Trash2, ArrowRightLeft, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';

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
}

export default function LibraryManagement() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'issues'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [books, setBooks] = useState<BookType[]>([]);
  const [issues, setIssues] = useState<IssueType[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState(false);
  const [isIssueBookModalOpen, setIsIssueBookModalOpen] = useState(false);
  const [newBook, setNewBook] = useState({ title: '', author: '', isbn: '', category: '', totalCopies: 1 });
  const [issueData, setIssueData] = useState({ bookId: '', studentId: '', dueDate: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Use GET /api/v1/library/books
      const booksRes = await apiClient.get('/library/books');
      setBooks(booksRes.data.data || []);
      
      // We will try fetching issues via GET /api/v1/library/issues, though instructions focus on POST.
      try {
        const issuesRes = await apiClient.get('/library/issues');
        setIssues(issuesRes.data.data || []);
      } catch (err) {
        console.error("Failed to fetch issues", err);
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
    } catch (error) {
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
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to issue book');
    }
  };

  const handleReturnBook = async (issueId: string) => {
    try {
      await apiClient.put(`/library/issues/${issueId}/return`);
      toast.success('Book returned successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to return book');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Library Management</h2>
          <p className="text-slate-400 text-sm">Manage books, catalogs, and issuing.</p>
        </div>
        <button 
          onClick={() => activeTab === 'catalog' ? setIsAddBookModalOpen(true) : setIsIssueBookModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'catalog' ? 'Add Book' : 'Issue Book'}
        </button>
      </div>

      <div className="glass rounded-2xl border border-white/10 flex overflow-hidden">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'catalog' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          Book Catalog
        </button>
        <button
          onClick={() => setActiveTab('issues')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'issues' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          Issue Tracking
        </button>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={activeTab === 'catalog' ? "Search books by title, author, or ISBN..." : "Search issues by student or book..."}
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="px-4 py-2 bg-slate-800 border border-white/10 hover:bg-slate-700 text-white rounded-xl flex items-center gap-2 transition-colors">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-10">Loading...</div>
      ) : activeTab === 'catalog' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {books.filter(b => b.title.toLowerCase().includes(searchQuery.toLowerCase())).map((book) => (
            <div key={book.id} className="glass p-5 rounded-2xl border border-white/10 hover:border-blue-500/50 transition-colors group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                  <Book className="w-6 h-6" />
                </div>
                <div className="flex gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${book.status === 'Available' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/20 text-amber-400 border border-amber-500/20'}`}>
                    {book.status}
                  </span>
                  <button className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1 line-clamp-1">{book.title}</h3>
              <p className="text-slate-400 text-sm mb-4">{book.author}</p>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-900/50 p-3 rounded-xl border border-white/5">
                  <p className="text-xs text-slate-500 mb-1">Category</p>
                  <p className="text-sm text-slate-300 font-medium">{book.category}</p>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-white/5">
                  <p className="text-xs text-slate-500 mb-1">Copies</p>
                  <p className="text-sm text-slate-300 font-medium">{book.availableCopies} / {book.totalCopies}</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-white/10">
                <span>ISBN: {book.isbn}</span>
                <div className="flex gap-2">
                   <button className="p-1 hover:text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                   <button className="p-1 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="p-4 text-sm font-semibold text-slate-300">Book</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Student</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Issue Date</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Due Date</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Status</th>
                  <th className="p-4 text-sm font-semibold text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {issues.filter(i => i.bookTitle.toLowerCase().includes(searchQuery.toLowerCase()) || i.studentName.toLowerCase().includes(searchQuery.toLowerCase())).map((issue) => (
                  <tr key={issue.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                          <Book className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-white">{issue.bookTitle}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-300">{issue.studentName}</td>
                    <td className="p-4 text-sm text-slate-400">{issue.issueDate}</td>
                    <td className="p-4 text-sm text-slate-400">{issue.dueDate}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${issue.status === 'Issued' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' : 'bg-red-500/20 text-red-400 border border-red-500/20'}`}>
                        {issue.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <button onClick={() => handleReturnBook(issue.id)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors" title="Return Book">
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Add Book Modal */}
      {isAddBookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Add New Book</h3>
              <button onClick={() => setIsAddBookModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddBook} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                <input required type="text" value={newBook.title} onChange={e => setNewBook({...newBook, title: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Author</label>
                <input required type="text" value={newBook.author} onChange={e => setNewBook({...newBook, author: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">ISBN</label>
                <input required type="text" value={newBook.isbn} onChange={e => setNewBook({...newBook, isbn: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
                  <input required type="text" value={newBook.category} onChange={e => setNewBook({...newBook, category: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Copies</label>
                  <input required type="number" min="1" value={newBook.totalCopies} onChange={e => setNewBook({...newBook, totalCopies: parseInt(e.target.value)})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAddBookModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors">Add Book</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Book Modal */}
      {isIssueBookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Issue Book</h3>
              <button onClick={() => setIsIssueBookModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleIssueBookSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Book ID</label>
                <input required type="text" value={issueData.bookId} onChange={e => setIssueData({...issueData, bookId: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Student ID</label>
                <input required type="text" value={issueData.studentId} onChange={e => setIssueData({...issueData, studentId: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Due Date</label>
                <input required type="date" value={issueData.dueDate} onChange={e => setIssueData({...issueData, dueDate: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsIssueBookModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors">Issue Book</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
