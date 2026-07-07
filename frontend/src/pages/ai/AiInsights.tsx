import React, { useState, useEffect } from 'react';
import { Brain, TrendingUp, AlertTriangle, ShieldAlert, Activity, Zap, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';

interface AtRiskStudent {
  studentId: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  attendanceRate: number;
  averageMarks: number;
  riskLevel: string;
  reason: string;
}

interface InsightsData {
  studentCount: number;
  staffCount: number;
  totalOutstandingDue: number;
  summary: string;
  generatedAt: string;
}

const DEFAULT_INSIGHTS: InsightsData = {
  studentCount: 0,
  staffCount: 0,
  totalOutstandingDue: 0,
  summary: "Loading AI insights...",
  generatedAt: new Date().toISOString()
};

export default function AiInsights() {
  const [insights, setInsights] = useState<InsightsData>(DEFAULT_INSIGHTS);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [insightsRes, riskScoringRes] = await Promise.all([
        apiClient.get('/ai/dashboard-insights'),
        apiClient.get('/ai/risk-scoring')
      ]);
      if (insightsRes.data?.data) setInsights(insightsRes.data.data);
      if (riskScoringRes.data?.data) setAtRiskStudents(riskScoringRes.data.data);
    } catch (error) {
      console.error('Failed to fetch AI insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshInsights = async () => {
    setLoading(true);
    try {
      const [insightsRes, riskScoringRes] = await Promise.all([
        apiClient.get('/ai/dashboard-insights'),
        apiClient.get('/ai/risk-scoring')
      ]);
      if (insightsRes.data?.data) setInsights(insightsRes.data.data);
      if (riskScoringRes.data?.data) setAtRiskStudents(riskScoringRes.data.data);
      toast.success("AI Analytics and At-Risk prediction models refreshed successfully.");
    } catch (error: any) {
      console.error('Failed to refresh AI insights:', error);
      toast.error(error.response?.data?.message || 'Failed to refresh AI analytics.');
    } finally {
      setLoading(false);
    }
  };

  const rawLines = insights.summary ? insights.summary.split('\n').map(l => l.trim()).filter(l => l) : [];
  const bulletPoints = rawLines.filter(l => l.startsWith('-'));
  const aiRecommendations = rawLines.filter(l => /^\d+\./.test(l));
  const executiveText = rawLines.filter(l => !l.startsWith('-') && !/^\d+\./.test(l) && !l.toLowerCase().includes('recommendation')).join(' ');

  const sortedStudents = [...atRiskStudents].sort((a, b) => {
    if (a.riskLevel === 'HIGH' && b.riskLevel !== 'HIGH') return -1;
    if (a.riskLevel !== 'HIGH' && b.riskLevel === 'HIGH') return 1;
    if (a.riskLevel === 'MEDIUM' && b.riskLevel === 'LOW') return -1;
    if (a.riskLevel === 'LOW' && b.riskLevel === 'MEDIUM') return 1;
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Brain className="w-7 h-7 text-indigo-400" />
            AI-Driven Insights
          </h2>
          <p className="text-slate-400 mt-1">
            Real-time machine learning predictions, statistics correlation, and student monitoring.
          </p>
        </div>
        <button
          onClick={handleRefreshInsights}
          disabled={loading}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
        >
          <Brain className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
          {loading ? 'Running Analysis...' : 'Recalculate Insights'}
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-20 flex flex-col items-center justify-center space-y-4">
          <Activity className="w-8 h-8 text-indigo-500 animate-pulse" />
          <p className="animate-pulse">Running advanced diagnostic models...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass p-6 rounded-3xl border border-white/5 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 transition-transform group-hover:scale-110" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm mb-4 uppercase tracking-widest">
                  <TrendingUp className="w-4.5 h-4.5" />
                  Executive Summary
                </div>
                
                {executiveText && (
                  <p className="text-slate-200 text-base leading-relaxed font-light italic mb-4">
                    "{executiveText.replace('AI Executive Summary for Institution:', '').trim()}"
                  </p>
                )}
                
                <div className="space-y-2 mt-4 bg-slate-950/40 p-4 rounded-2xl border border-white/5">
                  {bulletPoints.map((bp, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                      <span>{bp.replace('-', '').trim()}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="relative z-10 mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Powered by PeopleIT Core ML Engine</span>
                <span>Generated At: {new Date(insights.generatedAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="glass p-6 rounded-3xl border border-white/5 space-y-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 relative z-10">
                <Activity className="w-4 h-4 text-emerald-400" /> Metrics Overview
              </h3>
              
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/50 border border-white/5 hover:bg-slate-900/80 transition-colors">
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Students</span>
                  <span className="text-lg font-black text-white">{insights.studentCount}</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/50 border border-white/5 hover:bg-slate-900/80 transition-colors">
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Active Staff</span>
                  <span className="text-lg font-black text-indigo-400">{insights.staffCount}</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/50 border border-white/5 hover:bg-slate-900/80 transition-colors">
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Outstanding Due</span>
                  <span className="text-lg font-black text-rose-400">৳{insights.totalOutstandingDue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {aiRecommendations.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" /> Actionable Recommendations
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiRecommendations.map((rec, idx) => {
                  const titleMatch = rec.match(/^\d+\.\s*(.*?):/);
                  const title = titleMatch ? titleMatch[1] : `Recommendation ${idx + 1}`;
                  const content = rec.replace(/^\d+\.\s*(.*?):/, '').trim();
                  
                  return (
                    <div key={idx} className="glass p-5 rounded-2xl border border-amber-500/10 bg-amber-500/5 hover:border-amber-500/20 transition-colors flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                        <span className="font-black">{idx + 1}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-300 mb-1">{title}</h4>
                        <p className="text-xs text-slate-300 leading-relaxed">{content || rec}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4 mt-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                Risk Assessment Board
              </h3>
              <span className="text-xs font-bold text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/5">
                {atRiskStudents.length} Students Evaluated
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {sortedStudents.map((student) => {
                const isHigh = student.riskLevel === 'HIGH';
                const isMed = student.riskLevel === 'MEDIUM';
                
                const badgeColor = isHigh 
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                  : isMed 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                return (
                  <div key={student.studentId} className="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors bg-slate-900/30">
                    <div className="flex flex-col lg:flex-row gap-6 justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                          isHigh ? 'bg-rose-500/20 text-rose-400' : 'bg-indigo-500/20 text-indigo-400'
                        }`}>
                          {student.firstName ? student.firstName[0].toUpperCase() : '?'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">{student.firstName} {student.lastName}</span>
                            <span className="text-[10px] font-bold tracking-wider text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                              {student.registrationNumber}
                            </span>
                          </div>
                          
                          <div className="mt-3 bg-slate-950/40 border border-white/5 p-3.5 rounded-2xl max-w-2xl">
                            <p className="text-sm text-slate-300 leading-relaxed flex gap-2 items-start">
                              {isHigh ? <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />}
                              <span>{student.reason}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4 border-t lg:border-t-0 lg:border-l border-white/5 pt-4 lg:pt-0 lg:pl-6 flex-shrink-0 min-w-[200px]">
                        <div className="text-left lg:text-right w-full flex lg:justify-end">
                          <span className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border ${badgeColor}`}>
                            {student.riskLevel} RISK
                          </span>
                        </div>

                        <div className="flex items-center gap-5 bg-slate-950/30 px-4 py-2 rounded-xl border border-white/5">
                          <div className="text-center">
                            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Avg Grade</div>
                            <div className={`text-sm font-black mt-0.5 ${student.averageMarks < 60 ? 'text-rose-400' : 'text-slate-200'}`}>
                              {student.averageMarks ? student.averageMarks.toFixed(1) : 0}%
                            </div>
                          </div>
                          <div className="w-px h-6 bg-slate-800" />
                          <div className="text-center">
                            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Attendance</div>
                            <div className={`text-sm font-black mt-0.5 ${student.attendanceRate < 80 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {student.attendanceRate ? student.attendanceRate.toFixed(1) : 0}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
