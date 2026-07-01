import React, { useState, useEffect } from "react";
import { GitHubUser, GitHubRepo } from "./types";
import SetupInstructions from "./components/SetupInstructions";
import UserProfileCard from "./components/UserProfileCard";
import RepositoryList from "./components/RepositoryList";
import RepositoryDetailsView from "./components/RepositoryDetailsView";
import PhotoneshopStudio from "./components/PhotoneshopStudio";
import { Github, Loader, RefreshCw, CircleAlert, CodeXml, Grid } from "lucide-react";

export default function App() {
  const [currentView, setCurrentView] = useState<"dashboard" | "photoneshop">("photoneshop");
  const [token, setToken] = useState<string | null>(localStorage.getItem("github_token"));
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);
  const [isSubmittingPAT, setIsSubmittingPAT] = useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const [patError, setPatError] = useState<string | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);

  const [customRepoQuery, setCustomRepoQuery] = useState("");
  const [isFetchingCustomRepo, setIsFetchingCustomRepo] = useState(false);
  const [customRepoError, setCustomRepoError] = useState<string | null>(null);

  // 1. Fetch authentication status
  const checkAuthStatus = async (overrideToken?: string) => {
    setIsCheckingAuth(true);
    try {
      const activeToken = overrideToken || token;
      const headers: HeadersInit = {};
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }
      const response = await fetch("/api/auth/status", { headers });
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          if (activeToken) {
            localStorage.setItem("github_token", activeToken);
            setToken(activeToken);
          }
          // Load repos right away for authenticated user
          fetchUserRepositories(activeToken);
        } else {
          setUser(null);
          setToken(null);
          localStorage.removeItem("github_token");
        }
      } else {
        setUser(null);
        setToken(null);
        localStorage.removeItem("github_token");
      }
    } catch (error) {
      console.error("Failed to check auth status:", error);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  // 2. Fetch User Repositories
  const fetchUserRepositories = async (activeToken?: string) => {
    setIsLoadingRepos(true);
    setReposError(null);
    try {
      const currentToken = activeToken || token;
      const headers: HeadersInit = {};
      if (currentToken) {
        headers["Authorization"] = `Bearer ${currentToken}`;
      }
      const response = await fetch("/api/github/repos", { headers });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch repositories. Please try reconnecting.");
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setRepos(data);
        // Default select the first repository if available
        if (data.length > 0) {
          setSelectedRepo(data[0]);
        }
      } else {
        setRepos([]);
      }
    } catch (error: any) {
      console.error("Failed to fetch repositories:", error);
      setReposError(error.message || "Could not retrieve repositories.");
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // Fetch a specific repository directly (e.g., owner/repo)
  const handleFetchSingleRepo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!customRepoQuery.trim()) return;

    let query = customRepoQuery.trim();
    let parts = query.split("/");
    
    // Auto-prepend current user's login name if no owner is specified
    if (parts.length === 1 && user?.login) {
      query = `${user.login}/${query}`;
      parts = query.split("/");
    }

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setCustomRepoError("Format: owner/repository-name (e.g. facebook/react) or simply repository-name");
      return;
    }

    const [owner, repoName] = parts;
    setIsFetchingCustomRepo(true);
    setCustomRepoError(null);

    try {
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/github/repos/${owner}/${repoName}`, { headers });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Repository not found or access denied.");
      }

      const newRepo: GitHubRepo = await response.json();
      
      // Prepend to repo list if not already present
      setRepos((prevRepos) => {
        const exists = prevRepos.some((r) => r.id === newRepo.id);
        if (exists) {
          return prevRepos;
        }
        return [newRepo, ...prevRepos];
      });

      setSelectedRepo(newRepo);
      setCustomRepoQuery("");
    } catch (err: any) {
      console.error("Custom repo fetch error:", err);
      setCustomRepoError(err.message || "Failed to fetch repository details.");
    } finally {
      setIsFetchingCustomRepo(false);
    }
  };

  // 3. Trigger Standard OAuth popup flow
  const handleConnectOAuth = async () => {
    setIsConnectingOAuth(true);
    try {
      // Fetch OAuth URL from server
      const response = await fetch("/api/auth/url");
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to retrieve authorize URL from the backend.");
      }
      
      const { url } = await response.json();
      
      // Open the OAuth provider URL directly in popup
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const authWindow = window.open(
        url,
        "github_oauth_popup",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
      );

      if (!authWindow) {
        alert("Popup was blocked! Please allow popups for this site to connect your GitHub account.");
      }
    } catch (error: any) {
      console.error("OAuth flow initiation error:", error);
      alert(error.message || "An error occurred starting the GitHub OAuth connection.");
    } finally {
      setIsConnectingOAuth(false);
    }
  };

  // 4. Connect via PAT (Personal Access Token)
  const handleConnectPAT = async (tokenInput: string) => {
    setIsSubmittingPAT(true);
    setPatError(null);
    try {
      const response = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to verify Personal Access Token.");
      }

      if (data.success && data.user && data.token) {
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem("github_token", data.token);
        fetchUserRepositories(data.token);
      }
    } catch (error: any) {
      console.error("PAT connection error:", error);
      setPatError(error.message || "An error occurred verifying the token.");
    } finally {
      setIsSubmittingPAT(false);
    }
  };

  // 4.5. Connect via Demo Mode
  const handleConnectDemo = async () => {
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST"
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user && data.token) {
          setUser(data.user);
          setToken(data.token);
          localStorage.setItem("github_token", data.token);
          fetchUserRepositories(data.token);
        }
      }
    } catch (error) {
      console.error("Demo mode login failed:", error);
    }
  };

  // 5. Logout
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      await fetch("/api/auth/logout", { method: "POST", headers });
      setUser(null);
      setToken(null);
      localStorage.removeItem("github_token");
      setRepos([]);
      setSelectedRepo(null);
    } catch (error) {
      console.error("Failed to sign out:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Listen for message events from standard popups
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin is from standard run domains or localhost
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }

      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        const oauthToken = event.data?.token;
        checkAuthStatus(oauthToken);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [token]);

  // Check auth status on component mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 font-sans antialiased selection:bg-teal-500/30 selection:text-teal-200">
      {/* Top Banner Navigation bar */}
      <header className="border-b border-slate-850 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-br from-teal-500 to-blue-600 rounded-xl flex items-center justify-center text-slate-950">
              <Github className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-slate-100 flex items-center gap-1">
                GitHub <span className="text-teal-400 font-medium">Dashboard</span>
              </span>
              <span className="block text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Enterprise Ingress</span>
            </div>
          </div>

          {/* Core Tab Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
            <button
              id="nav-dashboard-tab"
              onClick={() => setCurrentView("dashboard")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentView === "dashboard"
                  ? "bg-slate-800 text-teal-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Code Dashboard
            </button>
            <button
              id="nav-photoneshop-tab"
              onClick={() => setCurrentView("photoneshop")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                currentView === "photoneshop"
                  ? "bg-slate-800 text-teal-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Grid className="w-3.5 h-3.5 text-teal-400" />
              <span>Photoneshop Studio</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline-flex"
              title="GitHub homepage"
            >
              <Github className="w-4 h-4" />
            </a>
            <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />
            <span className="text-xs font-semibold text-slate-400 hidden sm:block bg-slate-950 border border-slate-850 px-2 py-1 rounded-lg">
              v1.1.0
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentView === "photoneshop" ? (
          <div className="animate-fade-in">
            <PhotoneshopStudio />
          </div>
        ) : isCheckingAuth ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-3">
            <Loader className="w-8 h-8 text-teal-400 animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Verifying active sessions...</p>
          </div>
        ) : !user ? (
          <div className="space-y-10 animate-fade-in">
            {/* OAuth Direct Connection Button Section */}
            <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute -top-12 -left-12 w-28 h-28 bg-teal-500/10 blur-2xl rounded-full" />
              <div className="absolute -bottom-12 -right-12 w-28 h-28 bg-blue-500/10 blur-2xl rounded-full" />

              <div className="relative z-10 space-y-5">
                <div className="w-12 h-12 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto text-teal-400">
                  <Github className="w-6 h-6" />
                </div>
                
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Standard Single-Click Sign In</h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Authenticate securely with GitHub to authorize and link your account instantly.
                  </p>
                </div>

                <button
                  id="oauth-connect-button"
                  onClick={handleConnectOAuth}
                  disabled={isConnectingOAuth}
                  className="w-full py-3 px-4 bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-teal-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isConnectingOAuth ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Opening Secure Window...</span>
                    </>
                  ) : (
                    <>
                      <Github className="w-4 h-4 fill-slate-950" />
                      <span>Connect with GitHub</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2 py-1">
                  <div className="h-[1px] bg-slate-800 flex-1" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">or</span>
                  <div className="h-[1px] bg-slate-800 flex-1" />
                </div>

                <button
                  id="demo-mode-button"
                  onClick={handleConnectDemo}
                  className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-850 text-teal-400 border border-slate-800 hover:border-slate-700 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🚀 Try with Demo Repositories (Guest Mode)</span>
                </button>
              </div>
            </div>

            {/* Separator */}
            <div className="flex items-center justify-center max-w-3xl mx-auto">
              <div className="h-[1px] bg-slate-850 flex-1" />
              <span className="px-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Configuration Guides & Fallback</span>
              <div className="h-[1px] bg-slate-850 flex-1" />
            </div>

            {/* Setup instructions and PAT fallback connection card */}
            <SetupInstructions
              onTokenSubmit={handleConnectPAT}
              isSubmitting={isSubmittingPAT}
              error={patError}
            />
          </div>
        ) : (
          /* Logged In Dashboard Layout (Bento Grid) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar Pane: Profile Card & Repositories list */}
            <div className="lg:col-span-5 space-y-6">
              <UserProfileCard
                user={user}
                onLogout={handleLogout}
                isLoggingOut={isLoggingOut}
              />

              <div className="bg-slate-900 border border-slate-850 rounded-2xl p-1.5 shadow-lg">
                <div className="p-4 flex items-center justify-between border-b border-slate-850/60 pb-3">
                  <span className="text-sm font-bold text-slate-200">Repository Selector</span>
                  <button
                    onClick={fetchUserRepositories}
                    disabled={isLoadingRepos}
                    className="p-1 text-slate-500 hover:text-teal-400 rounded transition-colors"
                    title="Reload repositories"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRepos ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {/* Direct Repository Fetcher Section */}
                <div className="px-4 py-3 bg-slate-950/30 border-b border-slate-850/50">
                  <form onSubmit={handleFetchSingleRepo} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="fetch-repo-input" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Direct Repository Fetcher</span>
                      </label>
                      <span className="text-[9px] text-slate-500 font-mono">Photoneshop or owner/repo</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        id="fetch-repo-input"
                        type="text"
                        placeholder="e.g. Photoneshop"
                        value={customRepoQuery}
                        onChange={(e) => setCustomRepoQuery(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-xs text-slate-100 placeholder:text-slate-600 rounded-xl px-3 py-2 transition-all outline-none"
                      />
                      <button
                        id="fetch-repo-submit"
                        type="submit"
                        disabled={isFetchingCustomRepo || !customRepoQuery.trim()}
                        className="px-3.5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold rounded-xl text-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {isFetchingCustomRepo ? "Loading..." : "Fetch"}
                      </button>
                    </div>
                    {customRepoError && (
                      <p className="text-[10px] text-rose-400 bg-rose-950/20 border border-rose-900/30 px-2.5 py-1.5 rounded-lg mt-1">
                        {customRepoError}
                      </p>
                    )}
                  </form>
                </div>

                <div className="p-2">
                  {isLoadingRepos ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-2">
                      <Loader className="w-6 h-6 text-teal-400 animate-spin" />
                      <p className="text-xs text-slate-500">Querying repository indexes...</p>
                    </div>
                  ) : reposError ? (
                    <div className="text-center py-10 px-4 bg-rose-950/20 border border-rose-900/30 rounded-xl">
                      <CircleAlert className="w-6 h-6 text-rose-500 mx-auto mb-1.5" />
                      <p className="text-xs text-slate-300 font-semibold">Error Loading Repositories</p>
                      <p className="text-[10px] text-slate-500 mt-1">{reposError}</p>
                    </div>
                  ) : (
                    <RepositoryList
                      repos={repos}
                      selectedRepo={selectedRepo}
                      onSelectRepo={(repo) => setSelectedRepo(repo)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Right Pane: Selected Repository Details (commits, issues, PRs) */}
            <div className="lg:col-span-7 h-full">
              {selectedRepo ? (
                <div className="h-[735px]">
                  <RepositoryDetailsView repo={selectedRepo} />
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center py-36 shadow-xl flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-center text-slate-700">
                    <CodeXml className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-200">No Repository Selected</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Please select a repository from the index list on the left to view commits, issues, and pull request history.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
