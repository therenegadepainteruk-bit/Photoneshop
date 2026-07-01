import React, { useState } from "react";
import { Key, HelpCircle, Code, Server, Copy, Check, ExternalLink } from "lucide-react";

interface SetupInstructionsProps {
  onTokenSubmit: (token: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

export default function SetupInstructions({
  onTokenSubmit,
  isSubmitting,
  error,
}: SetupInstructionsProps) {
  const [pat, setPat] = useState("");
  const [copiedDev, setCopiedDev] = useState(false);
  
  const currentOrigin = window.location.origin;
  const callbackUrl = `${currentOrigin}/auth/callback`;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDev(true);
      setTimeout(() => setCopiedDev(false), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pat.trim()) {
      onTokenSubmit(pat.trim());
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Intro Hero Header */}
      <div className="text-center py-4">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-100 sm:text-5xl">
          Connect to <span className="text-teal-400">GitHub</span>
        </h1>
        <p className="mt-3 text-lg text-slate-400 max-w-xl mx-auto">
          Explore your repositories, track recent commits, open issues, and pull requests from a unified developer dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Option A: Quick Personal Access Token */}
        <div id="pat-connection-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-slate-800/80 rounded-xl text-teal-400 border border-slate-700/50">
                <Key className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-slate-100">Option A: Personal Access Token</h3>
            </div>
            
            <p className="text-sm text-slate-400 mb-5 leading-relaxed">
              Connect instantly without registering a GitHub OAuth application. Ideal for quick local runs or private testing.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="pat-input" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Personal Access Token (classic or fine-grained)
                </label>
                <input
                  id="pat-input"
                  type="password"
                  placeholder="ghp_..."
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-100 placeholder:text-slate-600 rounded-xl px-3.5 py-2.5 text-sm transition-all outline-none"
                  disabled={isSubmitting}
                />
                <span className="block mt-1.5 text-xs text-slate-500">
                  Required scopes: <code className="text-teal-500 bg-slate-950 px-1 py-0.5 rounded text-[10px]">repo</code>, <code className="text-teal-500 bg-slate-950 px-1 py-0.5 rounded text-[10px]">read:user</code>
                </span>
              </div>

              {error && (
                <div className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/50 px-3.5 py-2.5 rounded-xl">
                  {error}
                </div>
              )}

              <button
                id="submit-pat-button"
                type="submit"
                disabled={isSubmitting || !pat.trim()}
                className="w-full py-2.5 px-4 bg-teal-500 hover:bg-teal-400 active:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold rounded-xl text-sm transition-all"
              >
                {isSubmitting ? "Connecting..." : "Connect instantly"}
              </button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=GitHub%20Dashboard%20Applet"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-400 transition-colors"
            >
              <span>Generate a token on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Option B: Standard secure OAuth Connection */}
        <div id="oauth-setup-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-slate-800/80 rounded-xl text-teal-400 border border-slate-700/50">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-slate-100">Option B: Standard GitHub OAuth</h3>
            </div>
            
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              Enable standard seamless single-click authorization flow by registering an OAuth App with GitHub.
            </p>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-slate-400 uppercase tracking-wider text-[10px]">Authorization Callback URL</span>
                  <button
                    onClick={() => handleCopy(callbackUrl)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-teal-400 transition-colors"
                    title="Copy URL"
                  >
                    {copiedDev ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <code className="block select-all font-mono text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800 text-[11px] overflow-x-auto whitespace-nowrap">
                  {callbackUrl}
                </code>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-200">How to configure:</h4>
                <ol className="list-decimal pl-4 space-y-1 text-slate-400 leading-relaxed">
                  <li>Go to GitHub <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer" className="text-teal-400 hover:underline inline-flex items-center gap-0.5">Developer Settings <ExternalLink className="w-2.5 h-2.5" /></a></li>
                  <li>Click <strong>Register a new application</strong></li>
                  <li>Set Homepage URL to <code className="bg-slate-950 px-1 py-0.5 rounded text-[10px]">{currentOrigin}</code></li>
                  <li>Set Callback URL to the copied URL above</li>
                  <li>Generate a Client Secret</li>
                  <li>Configure <code className="bg-slate-950 text-teal-400 px-1 py-0.5 rounded text-[10px]">GITHUB_CLIENT_ID</code> and <code className="bg-slate-950 text-teal-400 px-1 py-0.5 rounded text-[10px]">GITHUB_CLIENT_SECRET</code> in your AI Studio secrets</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80">
            <div className="text-xs text-slate-500 text-center flex items-center justify-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Full authorization details are stored securely.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
