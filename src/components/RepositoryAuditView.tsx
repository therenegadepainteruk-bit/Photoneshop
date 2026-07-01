import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  Sparkles, 
  CheckCircle, 
  Code, 
  Copy, 
  Check, 
  RefreshCw, 
  Play,
  FileText,
  Search,
  Filter
} from "lucide-react";
import { GitHubRepo, AuditReport, AuditFinding } from "../types";

interface RepositoryAuditViewProps {
  repo: GitHubRepo;
}

export default function RepositoryAuditView({ repo }: RepositoryAuditViewProps) {
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);

  const currentRepoIdRef = useRef<number | null>(null);

  const fetchAuditReport = async () => {
    const fetchRepoId = repo.id;
    setIsAuditing(true);
    setAuditError(null);
    setAuditReport(null);
    try {
      const token = localStorage.getItem("github_token");
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/audit`, { headers });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate repository audit report.");
      }
      const data: AuditReport = await response.json();
      if (currentRepoIdRef.current === fetchRepoId) {
        setAuditReport(data);
      }
    } catch (err: any) {
      console.error("Audit error:", err);
      if (currentRepoIdRef.current === fetchRepoId) {
        setAuditError(err.message || "An unexpected error occurred during the audit.");
      }
    } finally {
      if (currentRepoIdRef.current === fetchRepoId) {
        setIsAuditing(false);
      }
    }
  };

  useEffect(() => {
    currentRepoIdRef.current = repo.id;
    fetchAuditReport();
  }, [repo.id]);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(index);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isAuditing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 space-y-4 text-center">
        <div className="relative">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
            className="w-16 h-16 rounded-full border-4 border-teal-500/20 border-t-teal-400"
          />
          <motion.div 
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Sparkles className="w-6 h-6 text-teal-400" />
          </motion.div>
        </div>
        <div className="space-y-1 max-w-sm">
          <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">AI Engineering Audit in Progress</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Scanning files, parsing structure, examining configuration manifests, and evaluating security postures...
          </p>
        </div>
      </div>
    );
  }

  if (auditError) {
    return (
      <div className="py-12 px-6 text-center bg-rose-950/10 border border-rose-900/30 rounded-2xl p-6">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h4 className="text-sm font-bold text-slate-200">Audit Compilation Failed</h4>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">{auditError}</p>
        <button
          onClick={fetchAuditReport}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 mx-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Audit</span>
        </button>
      </div>
    );
  }

  if (!auditReport) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="p-4 bg-slate-900/40 rounded-full border border-slate-800">
          <ShieldCheck className="w-10 h-10 text-slate-600" />
        </div>
        <div className="space-y-1 max-w-xs">
          <h4 className="text-sm font-bold text-slate-300">Run Repository Auditor</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Generate an automated security, structure, and quality audit using AI model analysis.
          </p>
        </div>
        <button
          onClick={fetchAuditReport}
          className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Trigger Audit</span>
        </button>
      </div>
    );
  }

  // Derived metrics
  const findings = auditReport.findings || [];
  const strengths = auditReport.strengths || [];
  const score = auditReport.score ?? 0;
  const summary = auditReport.summary || "";

  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const warningCount = findings.filter(f => f.severity === "warning").length;
  const lowCount = findings.filter(f => f.severity === "low").length;
  const infoCount = findings.filter(f => f.severity === "info").length;

  const filteredFindings = findings.filter(f => {
    const matchesSeverity = severityFilter === "all" || f.severity === severityFilter;
    const matchesCategory = categoryFilter === "all" || f.category === categoryFilter;
    const matchesSearch = (f.title || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (f.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (f.category || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSeverity && matchesCategory && matchesSearch;
  });

  // Score styling
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-teal-400 border-teal-500/20 bg-teal-950/10";
    if (score >= 60) return "text-amber-400 border-amber-500/20 bg-amber-950/10";
    return "text-rose-400 border-rose-500/20 bg-rose-950/10";
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-950/55 text-rose-400 border border-rose-900/35">
            <ShieldAlert className="w-3 h-3" />
            Critical
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-950/55 text-amber-400 border border-amber-900/35">
            <AlertTriangle className="w-3 h-3" />
            Warning
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-950/55 text-sky-400 border border-sky-900/35">
            <Info className="w-3 h-3" />
            Low Risk
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-900 border border-slate-800 text-slate-400">
            <CheckCircle className="w-3 h-3" />
            Advice
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pt-3">
      {/* Overview Block */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Big Score Card */}
        <div className={`col-span-1 border rounded-2xl p-5 flex flex-col items-center justify-center text-center ${getScoreColor(score)}`}>
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Health Index</span>
          <div className="relative flex items-center justify-center">
            {/* Soft background pulse */}
            <div className="absolute inset-0 w-24 h-24 rounded-full border border-current opacity-10 animate-ping" />
            <span className="text-4xl font-black tracking-tighter">{score}</span>
            <span className="text-lg font-bold text-slate-500">/100</span>
          </div>
          <span className="text-xs font-bold mt-3 capitalize">
            {score >= 85 ? "Excellent Status" : score >= 60 ? "Warning Status" : "Critical Review Required"}
          </span>
        </div>

        {/* High-level summary */}
        <div className="col-span-1 md:col-span-3 bg-slate-900/30 border border-slate-850 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Lead Report Summary</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              {summary}
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-slate-850/60 text-center">
            <div className="bg-slate-950/40 p-1.5 rounded-xl border border-slate-900">
              <span className="block text-[10px] font-bold text-rose-400">{criticalCount}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Critical</span>
            </div>
            <div className="bg-slate-950/40 p-1.5 rounded-xl border border-slate-900">
              <span className="block text-[10px] font-bold text-amber-400">{warningCount}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Warning</span>
            </div>
            <div className="bg-slate-950/40 p-1.5 rounded-xl border border-slate-900">
              <span className="block text-[10px] font-bold text-sky-400">{lowCount}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Low Risk</span>
            </div>
            <div className="bg-slate-950/40 p-1.5 rounded-xl border border-slate-900">
              <span className="block text-[10px] font-bold text-slate-400">{infoCount}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Info</span>
            </div>
          </div>
        </div>
      </div>

      {/* Strengths Section */}
      {strengths && strengths.length > 0 && (
        <div className="bg-slate-900/10 border border-slate-850/50 rounded-2xl p-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Key Strengths Identified</span>
          </h4>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
            {strengths.map((str, idx) => (
              <li key={idx} className="flex items-start gap-2 bg-slate-950/30 px-3 py-2 rounded-xl border border-slate-900/60">
                <span className="text-emerald-400 font-extrabold select-none">•</span>
                <span className="font-semibold leading-relaxed">{str}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Interactive Findings Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Detailed Audit Findings ({filteredFindings.length})</span>
          </h4>

          {/* Refresh control */}
          <button
            onClick={fetchAuditReport}
            className="text-[10px] font-bold text-slate-400 hover:text-teal-400 flex items-center gap-1 bg-slate-900 border border-slate-850 px-2.5 py-1.5 rounded-xl cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Re-Run Audit</span>
          </button>
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-850/80 space-y-2.5">
          <div className="flex flex-col md:flex-row gap-2">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search findings, categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 placeholder:text-slate-650 text-xs px-9 py-2 rounded-xl focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all outline-none"
              />
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1">
              <Filter className="w-3 h-3 text-slate-500" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mr-1">Severity:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-300 border-none focus:outline-none cursor-pointer font-semibold py-1"
              >
                <option value="all" className="bg-slate-950">All Severities</option>
                <option value="critical" className="bg-slate-950">Critical</option>
                <option value="warning" className="bg-slate-950">Warning</option>
                <option value="low" className="bg-slate-950">Low Risk</option>
                <option value="info" className="bg-slate-950">Advice</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1">
              <FileText className="w-3 h-3 text-slate-500" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mr-1">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-300 border-none focus:outline-none cursor-pointer font-semibold py-1"
              >
                <option value="all" className="bg-slate-950">All Categories</option>
                <option value="Security" className="bg-slate-950">Security</option>
                <option value="Structure" className="bg-slate-950">Structure</option>
                <option value="Dependencies" className="bg-slate-950">Dependencies</option>
                <option value="Quality" className="bg-slate-950">Quality</option>
                <option value="Documentation" className="bg-slate-950">Documentation</option>
              </select>
            </div>
          </div>
        </div>

        {/* Findings Stack */}
        <div className="space-y-3">
          {filteredFindings.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/10 border border-slate-850/60 rounded-2xl">
              <ShieldCheck className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-bold">No matching findings found</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Adjust your filters or query constraints and try again.</p>
            </div>
          ) : (
            filteredFindings.map((finding, idx) => {
              const isExpanded = expandedFinding === idx;
              return (
                <motion.div
                  layout
                  key={idx}
                  className="bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-2xl overflow-hidden transition-all"
                >
                  {/* Finding Header Block (Toggleable) */}
                  <div
                    onClick={() => setExpandedFinding(isExpanded ? null : idx)}
                    className="p-4 flex items-start gap-3.5 cursor-pointer hover:bg-slate-900/20 transition-colors select-none"
                  >
                    <div className="mt-0.5">
                      {finding.severity === "critical" ? (
                        <ShieldAlert className="w-5 h-5 text-rose-400" />
                      ) : finding.severity === "warning" ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Info className="w-5 h-5 text-sky-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {getSeverityBadge(finding.severity)}
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">
                          {finding.category}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold text-slate-100 line-clamp-1">
                        {finding.title}
                      </h5>
                    </div>
                    <div className="text-slate-500 self-center">
                      <motion.span
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="block"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </motion.span>
                    </div>
                  </div>

                  {/* Finding Details Drawer */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-slate-850 bg-slate-900/10"
                      >
                        <div className="p-4 space-y-4 text-xs">
                          {/* Description */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Description & Impact</span>
                            <p className="text-slate-300 leading-relaxed font-medium">
                              {finding.description}
                            </p>
                          </div>

                          {/* Remediation Block */}
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Recommended Resolution</span>
                            <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-2 font-mono">
                              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                                {finding.remediation}
                              </p>
                              {/* If has commands/code templates inside remediation, let them easily copy */}
                              <div className="flex justify-between items-center bg-slate-950 border-t border-slate-900/80 pt-2 mt-2">
                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1">
                                  <Code className="w-3.5 h-3.5 text-slate-650" />
                                  Actionable Resolution Advice
                                </span>
                                <button
                                  onClick={() => handleCopy(finding.remediation, idx)}
                                  className="text-[10px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedId === idx ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copy Resolution</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Icon Helper
function ChevronDown(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
