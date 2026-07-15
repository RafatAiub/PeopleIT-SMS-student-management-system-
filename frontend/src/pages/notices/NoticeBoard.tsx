import React, { useState, useEffect } from 'react';
import { Megaphone, Plus, Calendar, Users, X, Clock, BookOpen, UserCheck, Shield, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';

interface NoticeItem {
  id: string;
  title: string;
  content: string;
  audience: 'ALL' | 'TEACHERS' | 'GUARDIANS' | 'STUDENTS';
  publishedAt: string;
}

const NoticeBoard = () => {
  const { user } = useAuthStore();
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [totalNotices, setTotalNotices] = useState(0);
  const { params, debouncedSearch, setPage, setPageSize, setSearch, setFilter } = useTableParams();
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<'ALL' | 'TEACHERS' | 'GUARDIANS' | 'STUDENTS'>('ALL');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const queryParams = new URLSearchParams({
          page: params.page.toString(),
          pageSize: params.pageSize.toString(),
        });
        if (debouncedSearch) queryParams.append('search', debouncedSearch);
        if (params.filters.audience) queryParams.append('audience', params.filters.audience);

        const response = await apiClient.get(`/notices?${queryParams.toString()}`);
        setNotices(response.data.data?.notices || response.data.data || []);
        setTotalNotices(response.data.data?.total || response.data.meta?.total || 0);
      } catch (error) {
        console.error('Failed to fetch notices', error);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchNotices();
  }, [params.page, params.pageSize, debouncedSearch, params.filters.audience]);

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const payload = {
        title,
        content,
        audience
      };
      
      const response = await apiClient.post('/notices', payload);
      setNotices([response.data.data, ...notices]);
      setTitle('');
      setContent('');
      setAudience('ALL');
      setShowAddForm(false);
      toast.success('Notice published successfully!');
    } catch (error: any) {
      console.error('Failed to create notice', error);
      toast.error(error.response?.data?.message || 'Failed to publish notice');
    } finally {
      setLoading(false);
    }
  };

  const getAudienceStyles = (aud: string) => {
    switch (aud) {
      case 'ALL':
        return {
          icon: <Megaphone className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />,
          color: 'border-l-indigo-500',
          badge: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20'
        };
      case 'TEACHERS':
        return {
          icon: <Shield className="w-5 h-5 text-teal-500 dark:text-teal-400" />,
          color: 'border-l-teal-500',
          badge: 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-500/20'
        };
      case 'GUARDIANS':
        return {
          icon: <UserCheck className="w-5 h-5 text-amber-500 dark:text-amber-400" />,
          color: 'border-l-amber-500',
          badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
        };
      case 'STUDENTS':
        return {
          icon: <BookOpen className="w-5 h-5 text-pink-500 dark:text-pink-400" />,
          color: 'border-l-pink-500',
          badge: 'bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-500/20'
        };
      default:
        return {
          icon: <Megaphone className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />,
          color: 'border-l-indigo-500',
          badge: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20'
        };
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-6 rounded-3xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900/40 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-500 opacity-50"></div>
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Notice Board</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm max-w-lg leading-relaxed">
            Stay updated with the latest official announcements, schedules, and important information for all members of the institution.
          </p>
        </div>
        {user?.role !== 'STUDENT' && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex-shrink-0 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-3 rounded-2xl transition-all shadow-xl shadow-blue-500/20 text-sm font-bold active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Publish Notice
          </button>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="glass-card p-4 rounded-3xl border border-slate-200/50 dark:border-white/5 flex flex-wrap gap-4 items-center shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search notices by title or content..."
            value={params.search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-11"
          />
        </div>
        <div className="relative">
          <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={params.filters.audience || ''}
            onChange={(e) => setFilter('audience', e.target.value)}
            className="input-field pl-11 pr-8 cursor-pointer"
          >
            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Audiences</option>
            <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Public (All)</option>
            <option value="TEACHERS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Teachers</option>
            <option value="GUARDIANS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Guardians</option>
            <option value="STUDENTS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Students</option>
          </select>
        </div>
      </div>

      {/* Notices Feed List */}
      <div className="relative">
        {/* Vertical Timeline Line */}
        <div className="absolute left-8 top-4 bottom-4 w-px bg-slate-200 dark:bg-white/5 hidden md:block"></div>

        <div className="space-y-6 relative z-10">
          {initialLoading ? (
            <div className="glass-card p-12 text-center text-slate-500 rounded-3xl border border-slate-200/50 dark:border-white/5 font-medium flex flex-col items-center justify-center space-y-3 shadow-sm bg-white dark:bg-transparent">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p>Fetching notices...</p>
            </div>
          ) : notices.length === 0 ? (
            <div className="glass-card p-12 text-center text-slate-500 rounded-3xl border border-slate-200/50 dark:border-white/5 flex flex-col items-center justify-center space-y-4 shadow-sm bg-white dark:bg-transparent">
              <Megaphone className="w-12 h-12 text-slate-400 dark:text-slate-600 opacity-50" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No notices published yet.</p>
              <p className="text-sm">When new announcements are posted, they will appear here.</p>
            </div>
          ) : (
            notices.map((notice) => {
              const styles = getAudienceStyles(notice.audience);
              return (
                <div 
                  key={notice.id} 
                  className={`glass-card p-6 md:p-8 rounded-3xl border border-slate-200/50 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-all flex flex-col md:flex-row gap-6 border-l-4 ${styles.color} shadow-sm bg-white dark:bg-transparent`}
                >
                  {/* Left Section: Icon & Meta */}
                  <div className="md:w-64 flex-shrink-0 flex flex-col space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 shadow-inner flex items-center justify-center border border-slate-200 dark:border-white/5`}>
                        {styles.icon}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${styles.badge}`}>
                        {notice.audience}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium bg-slate-50 dark:bg-slate-900/30 w-fit px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/5">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(notice.publishedAt)}
                    </div>
                  </div>

                  {/* Right Section: Content */}
                  <div className="flex-1 space-y-3 pt-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{notice.title}</h3>
                    <div className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed max-w-4xl whitespace-pre-wrap font-medium">
                      {notice.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="pt-4">
        <Pagination
          page={params.page}
          pageSize={params.pageSize}
          total={totalNotices}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Create Notice Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Megaphone className="w-6 h-6" />
                </div>
                Publish Announcement
              </h3>
              <button 
                onClick={() => setShowAddForm(false)} 
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleCreateNotice} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Notice Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Mid-Term Examination Schedule"
                  className="input-field px-5 py-3.5"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Target Audience</label>
                <div className="relative">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as any)}
                    className="input-field pl-12 pr-5 py-3.5 appearance-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">All Users (Public)</option>
                    <option value="TEACHERS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Teachers Only</option>
                    <option value="GUARDIANS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Guardians Only</option>
                    <option value="STUDENTS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Students Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Notice Content</label>
                <textarea
                  required
                  rows={6}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write the full details of the announcement here..."
                  className="input-field px-5 py-3.5 resize-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-slate-100 dark:border-white/5">
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)} 
                  className="px-6 py-3 rounded-2xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-8 rounded-2xl transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? 'Publishing...' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoticeBoard;
