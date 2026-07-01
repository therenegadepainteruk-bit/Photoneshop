import { useState, useEffect, useRef } from "react";
import { GitHubRepo, RepoDetails } from "../types";
import { GitCommit, CircleAlert, GitPullRequest, ExternalLink, RefreshCw, Loader, ShieldCheck, Terminal } from "lucide-react";
import RepositoryAuditView from "./RepositoryAuditView";
import RepositorySandboxView from "./RepositorySandboxView";

interface RepositoryDetailsViewProps {
  repo: GitHubRepo;
}

export default function RepositoryDetailsView({ repo }: RepositoryDetailsViewProps) {
  const [activeTab, setActiveTab] = useState<"commits" | "issues" | "pulls" | "audit" | "sandbox">("audit");
  const [details, setDetails] = useState<RepoDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRepoIdRef = useRef<number | null>(null);

  const fetchRepoDetails = async () => {
    const fetchRepoId = repo.id;
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("github_token");
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/details`, { headers });
      if (!response.ok) {
        throw new Error("Failed to fetch repository details");
      }
      const data = await response.json();
      if (currentRepoIdRef.current === fetchRepoId) {
        setDetails(data);
      }
    } catch (err: any) {
      console.error(err);
      if (currentRepoIdRef.current === fetchRepoId) {
        setError(err.message || "An error occurred while fetching details.");
      }
    } finally {
      if (currentRepoIdRef.current === fetchRepoId) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    currentRepoIdRef.current = repo.id;
    fetchRepoDetails();
  }, [repo]);

  // Format commit date helper
  const formatCommitDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div id="repo-details-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-full flex flex-col justify-between">
      <div className="space-y-5 flex-1 flex flex-col min-h-0">
        {/* Header section with repo meta */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-850">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Active Repository</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${repo.private ? "bg-rose-950/30 text-rose-400" : "bg-slate-950 text-slate-400"}`}>
                {repo.private ? "Private" : "Public"}
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-100 flex items-center gap-1.5">
              {repo.name}
            </h3>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Owner: <span className="text-slate-400">{repo.owner.login}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchRepoDetails}
              disabled={isLoading}
              className="p-2 hover:bg-slate-800 border border-slate-850 text-slate-400 hover:text-teal-400 rounded-xl transition-all cursor-pointer"
              title="Refresh details"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-teal-400" : ""}`} />
            </button>
            <a
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700/60 text-slate-200 hover:text-teal-400 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all"
            >
              <span>View on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Tab triggers */}
        <div className="flex border-b border-slate-850 text-xs">
          <button
            onClick={() => setActiveTab("commits")}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "commits"
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitCommit className="w-4 h-4" />
            <span>Commits ({details?.commits?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("issues")}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "issues"
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <CircleAlert className="w-4 h-4" />
            <span>Issues ({details?.issues?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("pulls")}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "pulls"
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitPullRequest className="w-4 h-4" />
            <span>PRs ({details?.pulls?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "audit"
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>AI Code Audit</span>
          </button>

          <button
            onClick={() => setActiveTab("sandbox")}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "sandbox"
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Interactive Sandbox</span>
          </button>
        </div>

        {/* Tab content wrapper */}
        <div className="flex-1 overflow-y-auto pr-1 min-h-[300px]">
          {activeTab === "audit" ? (
            <RepositoryAuditView repo={repo} />
          ) : activeTab === "sandbox" ? (
            <RepositorySandboxView repo={repo} />
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader className="w-8 h-8 text-teal-400 animate-spin mb-3" />
              <p className="text-sm text-slate-400 font-medium">Fetching repo history details...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 bg-rose-950/20 border border-rose-900/50 rounded-2xl p-6">
              <CircleAlert className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-semibold">Failed to fetch data</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">{error}</p>
              <button
                onClick={fetchRepoDetails}
                className="mt-4 px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-white font-medium rounded-xl text-xs transition-all"
              >
                Retry Request
              </button>
            </div>
          ) : !details ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              No details loaded.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {/* Commits Tab */}
              {activeTab === "commits" && (
                <div id="commits-list" className="space-y-2">
                  {details.commits.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      No commits found in the default branch.
                    </div>
                  ) : (
                    details.commits.map((c) => (
                      <a
                        key={c.sha}
                        href={c.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-3 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-xl hover:bg-slate-950/80 transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          {c.author?.avatar_url ? (
                            <img
                              src={c.author.avatar_url}
                              alt={c.author.login}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full border border-slate-800 mt-0.5"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mt-0.5 text-xs text-slate-400 font-bold">
                              {c.commit.author.name[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-200 group-hover:text-teal-400 transition-colors line-clamp-1">
                              {c.commit.message}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 mt-1">
                              <span className="font-semibold text-slate-400">
                                {c.author?.login || c.commit.author.name}
                              </span>
                              <span>•</span>
                              <span>{formatCommitDate(c.commit.author.date)}</span>
                              <span>•</span>
                              <span className="font-mono bg-slate-900 px-1 py-0.5 rounded border border-slate-850 text-slate-400 text-[9px]">
                                {c.sha.substring(0, 7)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              )}

              {/* Issues Tab */}
              {activeTab === "issues" && (
                <div id="issues-list" className="space-y-2">
                  {details.issues.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      No open issues found in this repository.
                    </div>
                  ) : (
                    details.issues.map((i) => (
                      <a
                        key={i.id}
                        href={i.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-3 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-xl hover:bg-slate-950/80 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <CircleAlert className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-200 group-hover:text-teal-400 transition-colors line-clamp-1">
                                {i.title}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
                                <span className="font-bold text-slate-400">#{i.number}</span>
                                <span>opened on {new Date(i.created_at).toLocaleDateString()}</span>
                                <span>by {i.user.login}</span>
                              </div>
                            </div>
                          </div>
                          
                          {i.comments > 0 && (
                            <span className="text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-full flex-shrink-0">
                              {i.comments} {i.comments === 1 ? "comment" : "comments"}
                            </span>
                          )}
                        </div>
                      </a>
                    ))
                  )}
                </div>
              )}

              {/* PRs Tab */}
              {activeTab === "pulls" && (
                <div id="prs-list" className="space-y-2">
                  {details.pulls.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      No open pull requests found in this repository.
                    </div>
                  ) : (
                    details.pulls.map((p) => (
                      <a
                        key={p.id}
                        href={p.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-3 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-xl hover:bg-slate-950/80 transition-all group"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <GitPullRequest className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-200 group-hover:text-teal-400 transition-colors line-clamp-1">
                              {p.title}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
                              <span className="font-bold text-slate-400">#{p.number}</span>
                              <span>opened on {new Date(p.created_at).toLocaleDateString()}</span>
                              <span>by {p.user.login}</span>
                            </div>
                          </div>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
