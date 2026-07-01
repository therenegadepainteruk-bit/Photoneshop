import { useState, useMemo } from "react";
import { GitHubRepo } from "../types";
import { Search, Star, GitFork, Shield, ShieldAlert, SlidersHorizontal, BookOpen } from "lucide-react";

interface RepositoryListProps {
  repos: GitHubRepo[];
  selectedRepo: GitHubRepo | null;
  onSelectRepo: (repo: GitHubRepo) => void;
}

export default function RepositoryList({
  repos,
  selectedRepo,
  onSelectRepo,
}: RepositoryListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const [selectedType, setSelectedType] = useState("all"); // all, public, private, forks, sources
  const [sortBy, setSortBy] = useState("updated"); // updated, stars, name

  // Extract all unique languages from repos list
  const languages = useMemo(() => {
    const list = new Set<string>();
    repos.forEach((repo) => {
      if (repo.language) list.add(repo.language);
    });
    return Array.from(list);
  }, [repos]);

  // Filter and sort repos
  const filteredAndSortedRepos = useMemo(() => {
    return repos
      .filter((repo) => {
        // Search term matching
        const matchesSearch =
          repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(searchTerm.toLowerCase()));

        // Language matching
        const matchesLanguage = selectedLanguage === "all" || repo.language === selectedLanguage;

        // Type matching
        let matchesType = true;
        if (selectedType === "public") matchesType = !repo.private;
        else if (selectedType === "private") matchesType = repo.private;
        else if (selectedType === "forks") matchesType = repo.forks_count > 0; // standard proxy check
        else if (selectedType === "sources") matchesType = true; // or not forklift/redirect if known

        return matchesSearch && matchesLanguage && matchesType;
      })
      .sort((a, b) => {
        if (sortBy === "updated") {
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        } else if (sortBy === "stars") {
          return b.stargazers_count - a.stargazers_count;
        } else if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [repos, searchTerm, selectedLanguage, selectedType, sortBy]);

  // Format date helper
  const formatUpdatedDate = (dateString: string) => {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Updated today";
    if (diffDays === 1) return "Updated yesterday";
    if (diffDays < 30) return `Updated ${diffDays} days ago`;
    return `Updated on ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  };

  // Basic language color map
  const getLanguageColorClass = (lang: string | null) => {
    if (!lang) return "bg-slate-500";
    const l = lang.toLowerCase();
    if (l === "javascript" || l === "js") return "bg-yellow-400";
    if (l === "typescript" || l === "ts") return "bg-blue-400";
    if (l === "python" || l === "py") return "bg-sky-500";
    if (l === "go") return "bg-cyan-400";
    if (l === "rust") return "bg-amber-600";
    if (l === "html") return "bg-orange-500";
    if (l === "css") return "bg-indigo-400";
    if (l === "java") return "bg-red-400";
    return "bg-teal-400";
  };

  return (
    <div className="space-y-4">
      {/* Search, Filter & Sort Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            id="repo-search-input"
            type="text"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-100 placeholder:text-slate-500 rounded-xl pl-10 pr-4 py-2.5 text-sm transition-all outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Filters trigger button */}
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Type Filter */}
          <select
            id="repo-type-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-300 rounded-xl px-2.5 py-1.5 outline-none transition-colors"
          >
            <option value="all">All Types</option>
            <option value="public">Public Only</option>
            <option value="private">Private Only</option>
          </select>

          {/* Language Filter */}
          <select
            id="repo-language-select"
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-300 rounded-xl px-2.5 py-1.5 outline-none transition-colors max-w-[140px]"
          >
            <option value="all">All Languages</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          {/* Sorting */}
          <select
            id="repo-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-300 rounded-xl px-2.5 py-1.5 outline-none transition-colors ml-auto"
          >
            <option value="updated">Sort by Updated</option>
            <option value="stars">Sort by Stars</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      {/* Repositories Counter */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Repositories ({filteredAndSortedRepos.length})
        </span>
        {searchTerm || selectedLanguage !== "all" || selectedType !== "all" ? (
          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedLanguage("all");
              setSelectedType("all");
            }}
            className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
          >
            Clear Filters
          </button>
        ) : null}
      </div>

      {/* Repositories Cards Grid */}
      <div id="repositories-grid" className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
        {filteredAndSortedRepos.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-2xl">
            <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">No repositories match your criteria.</p>
          </div>
        ) : (
          filteredAndSortedRepos.map((repo) => {
            const isSelected = selectedRepo?.id === repo.id;
            return (
              <div
                key={repo.id}
                id={`repo-card-${repo.id}`}
                onClick={() => onSelectRepo(repo)}
                className={`group border rounded-2xl p-4 cursor-pointer transition-all duration-250 flex flex-col justify-between h-36 relative overflow-hidden ${
                  isSelected
                    ? "bg-slate-850/80 border-teal-500 shadow-lg shadow-teal-500/5"
                    : "bg-slate-900 hover:bg-slate-850/50 border-slate-800/80 hover:border-slate-700/80"
                }`}
              >
                {/* Visual Highlight indicator left bar */}
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-500" />
                )}

                <div>
                  {/* Title & Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm text-slate-100 group-hover:text-teal-400 transition-colors truncate">
                      {repo.name}
                    </h4>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        repo.private
                          ? "bg-rose-950/30 text-rose-400 border-rose-900/50"
                          : "bg-slate-950 text-slate-400 border-slate-800"
                      }`}
                    >
                      {repo.private ? <ShieldAlert className="w-2.5 h-2.5" /> : <Shield className="w-2.5 h-2.5" />}
                      {repo.private ? "Private" : "Public"}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {repo.description || "No description provided."}
                  </p>
                </div>

                {/* Footer Metrics */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mt-3 pt-2.5 border-t border-slate-850/40">
                  <div className="flex items-center gap-3">
                    {repo.language && (
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${getLanguageColorClass(repo.language)}`} />
                        <span>{repo.language}</span>
                      </span>
                    )}

                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-500/90" />
                      <span>{repo.stargazers_count}</span>
                    </span>

                    <span className="flex items-center gap-1">
                      <GitFork className="w-3.5 h-3.5 text-blue-400" />
                      <span>{repo.forks_count}</span>
                    </span>
                  </div>

                  <div>{formatUpdatedDate(repo.updated_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
