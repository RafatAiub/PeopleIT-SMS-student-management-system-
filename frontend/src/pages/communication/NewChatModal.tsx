import React, { useEffect, useState } from 'react';
import { Search, User } from 'lucide-react';
import { Modal } from '@/components/ui';
import { useUserSearch, type UserSearchResult } from './messages.queries';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  onSelect: (user: UserSearchResult) => void;
}

export default function NewChatModal({ isOpen, onClose, currentUserId, onSelect }: NewChatModalProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setDebounced('');
    }
  }, [isOpen]);

  const { data: results = [], isLoading, isFetching } = useUserSearch(debounced, currentUserId);
  const searching = isLoading || isFetching;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start New Chat" size="lg">
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          data-autofocus
          type="text"
          aria-label="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email..."
          className="input-field pl-12 pr-5 py-3.5"
        />
      </div>

      <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-2 min-h-32">
        {debounced.trim().length < 2 ? (
          <p className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">Type at least 2 characters to search.</p>
        ) : searching ? (
          <div className="text-center py-8 text-slate-500">Searching...</div>
        ) : results.length > 0 ? (
          results.map((u) => (
            <button
              type="button"
              key={u.id}
              onClick={() => onSelect(u)}
              className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer border border-transparent transition-all text-left"
            >
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt={u.firstName} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-transparent">
                  <User className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">{u.firstName} {u.lastName}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{u.role}</p>
              </div>
            </button>
          ))
        ) : (
          <div className="text-center py-8 text-slate-500">No users found.</div>
        )}
      </div>
    </Modal>
  );
}
