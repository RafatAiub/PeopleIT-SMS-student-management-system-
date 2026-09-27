import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export interface BookFormValues {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  totalCopies: number;
  category: string;
  shelfLocation: string;
}

const EMPTY: BookFormValues = { title: '', author: '', isbn: '', publisher: '', totalCopies: 1, category: '', shelfLocation: '' };

interface LibraryBookModalProps {
  isOpen: boolean;
  initialValues: BookFormValues | null;
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: BookFormValues) => Promise<void> | void;
}

export const LibraryBookModal: React.FC<LibraryBookModalProps> = ({ isOpen, initialValues, isEditing, isSaving, onClose, onSubmit }) => {
  const [values, setValues] = useState<BookFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setValues(initialValues ?? EMPTY);
      setErrors({});
    }
  }, [isOpen, initialValues]);

  const validate = (v: BookFormValues) => {
    const next: Record<string, string> = {};
    if (!v.title.trim()) next.title = 'Title is required';
    if (!v.author.trim()) next.author = 'Author is required';
    if (!v.totalCopies || v.totalCopies < 1) next.totalCopies = 'Total copies must be at least 1';
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate(values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onSubmit(values);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Book' : 'Add New Book'}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="library-book-form" variant="gradient" isLoading={isSaving}>
            {isEditing ? 'Save Changes' : 'Add Book'}
          </Button>
        </>
      }
    >
      <form id="library-book-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          required
          value={values.title}
          onChange={(e) => setValues((p) => ({ ...p, title: e.target.value }))}
          error={errors.title}
        />
        <Input
          label="Author"
          required
          value={values.author}
          onChange={(e) => setValues((p) => ({ ...p, author: e.target.value }))}
          error={errors.author}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="ISBN"
            helperText="Optional"
            value={values.isbn}
            onChange={(e) => setValues((p) => ({ ...p, isbn: e.target.value }))}
          />
          <Input
            label="Publisher"
            helperText="Optional"
            value={values.publisher}
            onChange={(e) => setValues((p) => ({ ...p, publisher: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Category"
            helperText="Optional — e.g. Fiction, Science, Reference"
            value={values.category}
            onChange={(e) => setValues((p) => ({ ...p, category: e.target.value }))}
            maxLength={100}
          />
          <Input
            label="Shelf Location"
            helperText="Optional — e.g. Rack B, Shelf 3"
            value={values.shelfLocation}
            onChange={(e) => setValues((p) => ({ ...p, shelfLocation: e.target.value }))}
            maxLength={100}
          />
        </div>
        <Input
          label="Total Copies"
          type="number"
          min={1}
          required
          value={values.totalCopies}
          onChange={(e) => setValues((p) => ({ ...p, totalCopies: parseInt(e.target.value, 10) || 0 }))}
          error={errors.totalCopies}
          helperText={isEditing ? 'Increasing this adds available copies; decreasing removes them (never below 0).' : undefined}
        />
      </form>
    </Modal>
  );
};
