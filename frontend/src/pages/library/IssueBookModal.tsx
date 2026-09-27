import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Input';
import { StudentSearchInput, StudentSearchResult } from './StudentSearchInput';

export interface BookOption {
  id: string;
  title: string;
  author: string;
  availableCopies: number;
}

export interface IssueBookValues {
  bookId: string;
  studentId: string;
  dueDate: string;
}

interface IssueBookModalProps {
  isOpen: boolean;
  books: BookOption[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: IssueBookValues) => Promise<void> | void;
}

const defaultDueDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
};

export const IssueBookModal: React.FC<IssueBookModalProps> = ({ isOpen, books, isSaving, onClose, onSubmit }) => {
  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [bookId, setBookId] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setStudent(null);
      setBookId('');
      setDueDate(defaultDueDate());
      setErrors({});
    }
  }, [isOpen]);

  const availableBooks = books.filter((b) => b.availableCopies > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!student) next.studentId = 'Select a student';
    if (!bookId) next.bookId = 'Select a book';
    if (!dueDate) next.dueDate = 'Due date is required';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onSubmit({ bookId, studentId: student!.id, dueDate: new Date(dueDate).toISOString() });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Issue Book"
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="issue-book-form" variant="gradient" isLoading={isSaving}>Issue Book</Button>
        </>
      }
    >
      <form id="issue-book-form" onSubmit={handleSubmit} className="space-y-4">
        <StudentSearchInput value={student} onChange={setStudent} error={errors.studentId} required />
        <Select
          label="Book"
          required
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          error={errors.bookId}
          placeholder={availableBooks.length === 0 ? 'No books with available copies' : 'Select a book'}
          options={availableBooks.map((b) => ({ value: b.id, label: `${b.title} — ${b.author} (${b.availableCopies} available)` }))}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="issue-due-date" className="field-label">
            Due Date<span className="text-red-600 dark:text-red-400 ml-0.5" aria-hidden>*</span>
          </label>
          <input
            id="issue-due-date"
            type="date"
            required
            value={dueDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDueDate(e.target.value)}
            className={`input-field ${errors.dueDate ? 'border-rose-500 focus:ring-rose-500' : ''}`}
          />
          {errors.dueDate && <p className="field-error">{errors.dueDate}</p>}
        </div>
      </form>
    </Modal>
  );
};
