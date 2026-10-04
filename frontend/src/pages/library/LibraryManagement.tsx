import React, { useEffect, useState } from 'react';
import { Book, Plus, ArrowRightLeft, BarChart3, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useTableParams } from '../../hooks/useTableParams';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { DataTable, Column } from '../../components/DataTable/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Input';
import { PageHeader, ErrorState, Tabs } from '../../components/ui';
import { formatCurrency, formatDate } from '../../i18n';
import { LibraryBookModal, BookFormValues } from './LibraryBookModal';
import { IssueBookModal, IssueBookValues, BookOption } from './IssueBookModal';
import { ReturnBookModal } from './ReturnBookModal';
import { FineRuleModal } from './FineRuleModal';
import { LibraryReports } from './LibraryReports';

interface BookType {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  totalCopies: number;
  availableCopies: number;
  category?: string | null;
  shelfLocation?: string | null;
}

interface IssueType {
  id: string;
  bookId: string;
  studentId: string;
  issueDate: string;
  dueDate: string;
  returnDate: string | null;
  status: string;
  fineAmount: number | string;
  book?: { title: string; author: string; isbn: string | null };
  student?: { firstName: string; lastName: string };
}

const ISSUE_STATUS_OPTIONS = [
  { value: 'ISSUED', label: 'Issued' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'OVERDUE', label: 'Overdue' },
];

// A daily backend job now stores OVERDUE on ISSUED loans past their due
// date (library.scheduler.ts). Until it runs, a loan can still be ISSUED and
// past due, so both count as overdue here. The server's status filter
// matches: status=OVERDUE returns stored OVERDUE + past-due ISSUED loans, and
// status=ISSUED returns every loan still out (ISSUED + OVERDUE), so the
// "Showing X-Y of Z" count is accurate for every filter.
const isOverdue = (issue: IssueType) =>
  issue.status === 'OVERDUE' || (issue.status === 'ISSUED' && new Date(issue.dueDate).getTime() < new Date().setHours(0, 0, 0, 0));
// OVERDUE loans are still out and can be returned exactly like ISSUED ones.
const isOut = (issue: IssueType) => issue.status === 'ISSUED' || issue.status === 'OVERDUE';

export default function LibraryManagement() {
  const [activeTab, setActiveTab] = useState<'books' | 'issues' | 'reports'>('books');
  const [fineRuleOpen, setFineRuleOpen] = useState(false);

  // ---- Books tab ----
  const booksParams = useTableParams(10);
  const [books, setBooks] = useState<BookType[]>([]);
  const [booksTotal, setBooksTotal] = useState(0);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState(false);

  // A larger, unpaginated-ish list of books for the Issue Book modal's
  // book picker — kept separate from the paginated table above.
  const [allBooks, setAllBooks] = useState<BookOption[]>([]);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookType | null>(null);
  const [savingBook, setSavingBook] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<BookType | null>(null);
  const [deletingBook, setDeletingBook] = useState(false);

  // ---- Issues tab ----
  const issuesParams = useTableParams(10);
  const [issueStatusFilter, setIssueStatusFilter] = useState('');
  const [issues, setIssues] = useState<IssueType[]>([]);
  const [issuesTotal, setIssuesTotal] = useState(0);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState(false);

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issuingBook, setIssuingBook] = useState(false);
  const [issueToReturn, setIssueToReturn] = useState<IssueType | null>(null);
  const [returningBook, setReturningBook] = useState(false);

  const fetchBooks = async () => {
    setBooksLoading(true);
    setBooksError(false);
    try {
      const res = await apiClient.get('/library/books', {
        params: { page: booksParams.params.page, pageSize: booksParams.params.pageSize, search: booksParams.debouncedSearch || undefined },
      });
      setBooks(res.data.data?.books || res.data.data || []);
      setBooksTotal(res.data.meta?.total || res.data.data?.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch library books:', err);
      setBooksError(true);
      toast.error(err.response?.data?.message || 'Failed to load books');
    } finally {
      setBooksLoading(false);
    }
  };

  const fetchAllBooksForIssuing = async () => {
    try {
      const res = await apiClient.get('/library/books', { params: { page: 1, pageSize: 200 } });
      setAllBooks(res.data.data?.books || res.data.data || []);
    } catch {
      setAllBooks([]);
    }
  };

  const fetchIssues = async () => {
    setIssuesLoading(true);
    setIssuesError(false);
    try {
      // The server resolves OVERDUE (stored + past-due ISSUED) itself.
      const statusParam = issueStatusFilter || undefined;
      const res = await apiClient.get('/library/issues', {
        params: {
          page: issuesParams.params.page,
          pageSize: issuesParams.params.pageSize,
          search: issuesParams.debouncedSearch || undefined,
          status: statusParam,
        },
      });
      const list: IssueType[] = res.data.data?.issues || res.data.data || [];
      const total = res.data.meta?.total || res.data.data?.total || 0;
      setIssues(list);
      setIssuesTotal(total);
    } catch (err: any) {
      console.error('Failed to fetch library issues:', err);
      setIssuesError(true);
      toast.error(err.response?.data?.message || 'Failed to load issues');
    } finally {
      setIssuesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'books') fetchBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, booksParams.params.page, booksParams.params.pageSize, booksParams.debouncedSearch]);

  useEffect(() => {
    if (activeTab === 'issues') fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, issuesParams.params.page, issuesParams.params.pageSize, issuesParams.debouncedSearch, issueStatusFilter]);

  useEffect(() => {
    fetchAllBooksForIssuing();
  }, []);

  // ---- Book CRUD ----
  const openAddBook = () => { setEditingBook(null); setBookModalOpen(true); };
  const openEditBook = (book: BookType) => { setEditingBook(book); setBookModalOpen(true); };

  const handleSaveBook = async (values: BookFormValues) => {
    setSavingBook(true);
    try {
      if (editingBook) {
        await apiClient.put(`/library/books/${editingBook.id}`, values);
        toast.success('Book updated successfully');
      } else {
        await apiClient.post('/library/books', values);
        toast.success('Book added successfully');
      }
      setBookModalOpen(false);
      setEditingBook(null);
      fetchBooks();
      fetchAllBooksForIssuing();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${editingBook ? 'update' : 'add'} book`);
    } finally {
      setSavingBook(false);
    }
  };

  const handleConfirmDeleteBook = async () => {
    if (!bookToDelete) return;
    setDeletingBook(true);
    try {
      await apiClient.delete(`/library/books/${bookToDelete.id}`);
      toast.success('Book deleted successfully');
      setBookToDelete(null);
      fetchBooks();
      fetchAllBooksForIssuing();
    } catch (err: any) {
      // 409 Conflict: book has active ISSUED loans.
      toast.error(err.response?.data?.message || 'Failed to delete book');
    } finally {
      setDeletingBook(false);
    }
  };

  // ---- Issue / return ----
  const handleIssueBook = async (values: IssueBookValues) => {
    setIssuingBook(true);
    try {
      await apiClient.post('/library/issues', values);
      toast.success('Book issued successfully');
      setIssueModalOpen(false);
      fetchIssues();
      fetchAllBooksForIssuing();
      if (activeTab === 'books') fetchBooks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to issue book');
    } finally {
      setIssuingBook(false);
    }
  };

  const handleReturnBook = async (fineAmount: number) => {
    if (!issueToReturn) return;
    setReturningBook(true);
    try {
      await apiClient.put(`/library/issues/${issueToReturn.id}/return`, { fineAmount });
      toast.success('Book returned successfully');
      setIssueToReturn(null);
      fetchIssues();
      fetchAllBooksForIssuing();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to return book');
    } finally {
      setReturningBook(false);
    }
  };

  const bookColumns: Column<BookType>[] = [
    { key: 'title', header: 'Title', accessor: 'title', primary: true },
    { key: 'author', header: 'Author', accessor: 'author' },
    { key: 'isbn', header: 'ISBN', render: (b) => b.isbn || '—', hideOnMobile: true },
    { key: 'publisher', header: 'Publisher', render: (b) => b.publisher || '—', hideOnMobile: true },
    { key: 'category', header: 'Category', render: (b) => b.category || '—', exportValue: (b) => b.category || '', hideOnMobile: true },
    { key: 'shelfLocation', header: 'Shelf', render: (b) => b.shelfLocation || '—', exportValue: (b) => b.shelfLocation || '', hideOnMobile: true },
    {
      key: 'copies',
      header: 'Copies',
      align: 'right',
      exportValue: (b) => `${b.availableCopies}/${b.totalCopies}`,
      render: (b) => <span className="tabular-nums">{b.availableCopies} / {b.totalCopies}</span>,
    },
    {
      key: 'availability',
      header: 'Availability',
      sortable: false,
      exportValue: (b) => (b.availableCopies > 0 ? 'Available' : 'Not Available'),
      render: (b) => <Badge variant={b.availableCopies > 0 ? 'success' : 'warning'}>{b.availableCopies > 0 ? 'Available' : 'Not Available'}</Badge>,
    },
  ];

  const issueColumns: Column<IssueType>[] = [
    {
      key: 'book',
      header: 'Book',
      primary: true,
      sortable: false,
      render: (issue) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-transparent shrink-0">
            <Book className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-slate-900 dark:text-white">{issue.book?.title || '—'}</span>
        </div>
      ),
      exportValue: (issue) => issue.book?.title || '',
    },
    {
      key: 'student',
      header: 'Student',
      sortable: false,
      render: (issue) => `${issue.student?.firstName || ''} ${issue.student?.lastName || ''}`.trim() || '—',
      exportValue: (issue) => `${issue.student?.firstName || ''} ${issue.student?.lastName || ''}`.trim(),
    },
    { key: 'issueDate', header: 'Issue Date', render: (issue) => formatDate(issue.issueDate), exportValue: (issue) => issue.issueDate },
    { key: 'dueDate', header: 'Due Date', render: (issue) => formatDate(issue.dueDate), exportValue: (issue) => issue.dueDate },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (issue) =>
        isOverdue(issue) ? (
          <span title="Overdue (past due date)">
            <Badge variant="danger">Overdue (past due date)</Badge>
          </span>
        ) : (
          <StatusBadge status={issue.status} />
        ),
      exportValue: (issue) => (isOverdue(issue) ? 'OVERDUE' : issue.status),
    },
    {
      key: 'fineAmount',
      header: 'Fine',
      align: 'right',
      exportValue: (issue) => Number(issue.fineAmount) || 0,
      render: (issue) => {
        const fine = Number(issue.fineAmount) || 0;
        return fine > 0 ? <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(fine)}</span> : <span className="text-slate-400">—</span>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (issue) =>
        isOut(issue) ? (
          <button
            type="button"
            onClick={() => setIssueToReturn(issue)}
            aria-label={`Return ${issue.book?.title || 'book'}`}
            title="Return book"
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library Management"
        description="Manage the book catalog and track issues and returns."
        actions={
          <>
            <Button variant="outline" onClick={() => setFineRuleOpen(true)}>
              <Settings2 className="w-4 h-4" /> Fine settings
            </Button>
            {activeTab === 'reports' ? (
        <LibraryReports />
      ) : activeTab === 'books' ? (
              <Button variant="gradient" onClick={openAddBook}>
                <Plus className="w-4 h-4" /> Add Book
              </Button>
            ) : activeTab === 'issues' ? (
              <Button variant="gradient" onClick={() => setIssueModalOpen(true)}>
                <Plus className="w-4 h-4" /> Issue Book
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs
        variant="pills"
        label="Library sections"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'books', label: 'Books', icon: <Book className="w-4 h-4" /> },
          { id: 'issues', label: 'Issues', icon: <ArrowRightLeft className="w-4 h-4" /> },
          { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
        ]}
      />

      {activeTab === 'books' ? (
        booksError && books.length === 0 ? (
          <ErrorState onRetry={fetchBooks} message="Could not load the book catalog." />
        ) : (
          <DataTable
            data={books}
            columns={bookColumns}
            isLoading={booksLoading}
            serverSearch
            onSearch={booksParams.setSearch}
            searchPlaceholder="Search books by title, author, ISBN, category or shelf..."
            serverPagination
            totalCount={booksTotal}
            page={booksParams.params.page}
            pageSize={booksParams.params.pageSize}
            onPageChange={booksParams.setPage}
            onPageSizeChange={booksParams.setPageSize}
            exportFileName="library-books"
            emptyTitle="No books in the catalog yet"
            emptyDescription="Add a book to start building your library catalog."
            emptyAction={<Button variant="gradient" size="sm" onClick={openAddBook}><Plus className="w-4 h-4" /> Add Book</Button>}
            actions={[
              { label: 'Edit', icon: 'edit', onClick: openEditBook },
              { label: 'Delete', icon: 'delete', variant: 'danger', onClick: (b) => setBookToDelete(b) },
            ]}
          />
        )
      ) : issuesError && issues.length === 0 ? (
        <ErrorState onRetry={fetchIssues} message="Could not load book issues." />
      ) : (
        <DataTable
          data={issues}
          columns={issueColumns}
          isLoading={issuesLoading}
          serverSearch
          onSearch={issuesParams.setSearch}
          searchPlaceholder="Search issues by student or book..."
          serverPagination
          totalCount={issuesTotal}
          page={issuesParams.params.page}
          pageSize={issuesParams.params.pageSize}
          onPageChange={issuesParams.setPage}
          onPageSizeChange={issuesParams.setPageSize}
          exportFileName="library-issues"
          toolbar={
            <Select
              value={issueStatusFilter}
              onChange={(e) => { setIssueStatusFilter(e.target.value); issuesParams.setPage(1); }}
              placeholder="All statuses"
              options={ISSUE_STATUS_OPTIONS}
              className="max-w-45"
              aria-label="Filter issues by status"
            />
          }
          emptyTitle="No book issues found"
          emptyDescription="Issue a book to a student to see it tracked here."
        />
      )}

      <LibraryBookModal
        isOpen={bookModalOpen}
        isEditing={!!editingBook}
        isSaving={savingBook}
        initialValues={editingBook ? { title: editingBook.title, author: editingBook.author, isbn: editingBook.isbn || '', publisher: editingBook.publisher || '', totalCopies: editingBook.totalCopies, category: editingBook.category || '', shelfLocation: editingBook.shelfLocation || '' } : null}
        onClose={() => { setBookModalOpen(false); setEditingBook(null); }}
        onSubmit={handleSaveBook}
      />

      <IssueBookModal
        isOpen={issueModalOpen}
        books={allBooks}
        isSaving={issuingBook}
        onClose={() => setIssueModalOpen(false)}
        onSubmit={handleIssueBook}
      />

      <ReturnBookModal
        isOpen={!!issueToReturn}
        bookTitle={issueToReturn?.book?.title || 'this book'}
        issueId={issueToReturn?.id ?? null}
        isSaving={returningBook}
        onClose={() => setIssueToReturn(null)}
        onSubmit={handleReturnBook}
      />

      <FineRuleModal isOpen={fineRuleOpen} onClose={() => setFineRuleOpen(false)} />

      <ConfirmModal
        isOpen={!!bookToDelete}
        title="Delete book"
        message={`Are you sure you want to delete "${bookToDelete?.title}"? This cannot be undone. Books with active loans cannot be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingBook}
        onConfirm={handleConfirmDeleteBook}
        onCancel={() => setBookToDelete(null)}
      />
    </div>
  );
}
