import React, { useState, useEffect, useRef } from 'react';
import { Send, Search, MessageSquare, Plus, X, User } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';

const Messages = () => {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Search Modal
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
    // Reduced polling frequency from 10s to 2 minutes to save database load
    const interval = setInterval(() => fetchConversations(true), 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeChatId) {
      fetchHistory(activeChatId);
      // Reduced polling frequency from 3s to 30s to save database load
      const interval = setInterval(() => fetchHistory(activeChatId, true), 30000);
      return () => clearInterval(interval);
    }
  }, [activeChatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async (silent = false) => {
    try {
      const res = await apiClient.get('/messages/conversations');
      setConversations(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch conversations', err);
      if (!silent) toast.error('Failed to load conversations');
    }
  };

  const fetchHistory = async (otherUserId: string, silent = false) => {
    if (!silent) setLoadingHistory(true);
    try {
      const res = await apiClient.get(`/messages/history/${otherUserId}`);
      setMessages(res.data.data || []);

      // Update local unread count
      setConversations(prev => prev.map(c =>
        c.user.id === otherUserId ? { ...c, unreadCount: 0 } : c
      ));
    } catch (err) {
      console.error('Failed to fetch history', err);
      if (!silent) toast.error('Failed to load message history');
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId) return;

    try {
      const payload = { content: newMessage, receiverId: activeChatId };
      setNewMessage('');
      
      // Optimistic update
      const tempMsg = {
        id: 'temp-' + Date.now(),
        content: payload.content,
        senderId: user?.id,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempMsg]);

      await apiClient.post('/messages', payload);
      fetchHistory(activeChatId, true);
      fetchConversations();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send message');
      fetchHistory(activeChatId, true); // revert optimistic
    }
  };

  const handleSearchUsers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const res = await apiClient.get(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data.data.filter((u: any) => u.id !== user?.id));
    } catch (error) {
      console.error(error);
    } finally {
      setSearching(false);
    }
  };

  const startNewChat = (selectedUser: any) => {
    // Check if conversation exists
    const exists = conversations.find(c => c.user.id === selectedUser.id);
    if (!exists) {
      // Add fake conversation to top
      setConversations([{
        user: selectedUser,
        latestMessage: null,
        unreadCount: 0
      }, ...conversations]);
    }
    setActiveChatId(selectedUser.id);
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const activeUser = activeChatId ? conversations.find(c => c.user.id === activeChatId)?.user : null;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Messages</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Communicate directly with staff, teachers, and students.</p>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 lg:w-96 glass-card rounded-3xl border border-slate-200/50 dark:border-white/5 flex flex-col overflow-hidden bg-white dark:bg-slate-900/40 shadow-sm">
          <div className="p-5 border-b border-slate-200/50 dark:border-white/5">
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-3 rounded-2xl transition-all shadow-lg shadow-blue-500/20 text-sm font-bold active:scale-[0.98]"
            >
              <Plus className="w-5 h-5" /> Start New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {conversations.length === 0 ? (
              <div className="text-center text-slate-500 mt-10 p-4">
                <p className="text-sm">No conversations yet.</p>
              </div>
            ) : (
              conversations.map((conv, i) => (
                <div 
                  key={i} 
                  onClick={() => setActiveChatId(conv.user.id)}
                  className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all ${
                    activeChatId === conv.user.id 
                      ? 'bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30' 
                      : 'hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="relative">
                    {conv.user.avatarUrl ? (
                      <img src={conv.user.avatarUrl} alt={conv.user.firstName} className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-white/10" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-white/10">
                        {conv.user.firstName.charAt(0)}{conv.user.lastName.charAt(0)}
                      </div>
                    )}
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{conv.user.firstName} {conv.user.lastName}</h4>
                    <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-slate-800 dark:text-white font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                      {conv.latestMessage?.content || 'No messages yet'}
                    </p>
                  </div>
                  {conv.latestMessage && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {new Date(conv.latestMessage.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 glass-card rounded-3xl border border-slate-200/50 dark:border-white/5 flex flex-col overflow-hidden bg-white dark:bg-slate-900/40 relative shadow-sm">
          {activeUser ? (
            <>
              <div className="p-5 border-b border-slate-200/50 dark:border-white/5 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-900/60 backdrop-blur-md sticky top-0 z-10">
                {activeUser.avatarUrl ? (
                  <img src={activeUser.avatarUrl} alt={activeUser.firstName} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-transparent">
                    {activeUser.firstName.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">{activeUser.firstName} {activeUser.lastName}</h3>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium tracking-wider uppercase">{activeUser.role}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {loadingHistory ? (
                  <div className="flex h-full items-center justify-center text-slate-500">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">Say hello to {activeUser.firstName}!</p>
                    <p className="text-sm">Start the conversation by sending a message below.</p>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isMine = msg.senderId === user?.id;
                    return (
                      <div key={msg.id || i} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-3xl px-5 py-3 ${
                          isMine 
                            ? 'bg-blue-600 text-white rounded-br-sm shadow-lg shadow-blue-500/20' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm border border-slate-200 dark:border-white/5 shadow-sm'
                        }`}>
                          <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <span className={`text-[10px] opacity-60 mt-1.5 block ${isMine ? 'text-right' : 'text-left'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-5 bg-slate-50/50 dark:bg-slate-900/60 border-t border-slate-200/50 dark:border-white/5 backdrop-blur-md">
                <form onSubmit={handleSend} className="flex items-center gap-3">
                  <input
                    type="text"
                    aria-label="Message"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="input-field px-5 py-4"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:hover:from-blue-600 disabled:hover:to-indigo-600 text-white rounded-2xl transition-all shadow-xl shadow-blue-500/20 flex-shrink-0"
                  >
                    <Send className="w-6 h-6" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center bg-slate-50/10 dark:bg-transparent">
              <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6 border border-slate-200 dark:border-white/5 shadow-inner">
                <MessageSquare className="w-10 h-10 text-slate-400 dark:text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Your Messages</h3>
              <p className="max-w-xs text-sm leading-relaxed text-slate-500">Select a conversation from the sidebar or start a new one to begin chatting.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Start New Chat</h3>
              <button 
                onClick={() => setIsSearchOpen(false)}
                aria-label="Close"
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                autoFocus
                type="text"
                aria-label="Search users"
                value={searchQuery}
                onChange={handleSearchUsers}
                placeholder="Search by name or email..."
                className="input-field pl-12 pr-5 py-3.5"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {searching ? (
                <div className="text-center py-8 text-slate-500">Searching...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map(u => (
                  <div 
                    key={u.id}
                    onClick={() => startNewChat(u)}
                    className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer border border-transparent transition-all"
                  >
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.firstName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-transparent">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">{u.firstName} {u.lastName}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{u.role}</p>
                    </div>
                  </div>
                ))
              ) : searchQuery.length >= 2 ? (
                <div className="text-center py-8 text-slate-500">No users found.</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;
