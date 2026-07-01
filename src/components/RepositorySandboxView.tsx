import React, { useState, useEffect } from "react";
import { GitHubRepo } from "../types";
import { 
  Folder, 
  File, 
  ChevronRight, 
  ArrowLeft, 
  Play, 
  RefreshCw, 
  Terminal, 
  Code, 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Cpu,
  Loader,
  AlertTriangle,
  Layers,
  Undo2
} from "lucide-react";

interface RepositorySandboxViewProps {
  repo: GitHubRepo;
}

interface SandboxContentItem {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
}

interface SuggestedAssertion {
  name: string;
  description: string;
  expectedBehavior: string;
}

interface GeneratedTestData {
  testCode: string;
  explanation: string;
  suggestedAssertions: SuggestedAssertion[];
}

interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  timedOut: boolean;
}

export default function RepositorySandboxView({ repo }: RepositorySandboxViewProps) {
  // Navigation & File Tree
  const [currentPath, setCurrentPath] = useState<string>("");
  const [contents, setContents] = useState<SandboxContentItem[]>([]);
  const [isLoadingContents, setIsLoadingContents] = useState(false);
  const [contentsError, setContentsError] = useState<string | null>(null);

  // Selected File
  const [selectedFile, setSelectedFile] = useState<SandboxContentItem | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Test suite states
  const [testCode, setTestCode] = useState<string>("");
  const [explanation, setExplanation] = useState<string>("");
  const [suggestedAssertions, setSuggestedAssertions] = useState<SuggestedAssertion[]>([]);
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Execution states
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Layout tabs
  const [sandboxTab, setSandboxTab] = useState<"test" | "terminal" | "source">("test");

  // Fetch directory contents
  const fetchContents = async (path: string) => {
    setIsLoadingContents(true);
    setContentsError(null);
    try {
      const token = localStorage.getItem("github_token");
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/contents?path=${encodeURIComponent(path)}`, { headers });
      if (!response.ok) {
        throw new Error("Failed to load folder contents.");
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const items = data.map((item: any) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size
        }));
        setContents(items);
      } else {
        throw new Error("Specified path is not a directory.");
      }
    } catch (err: any) {
      console.error(err);
      setContentsError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoadingContents(false);
    }
  };

  // Fetch contents on load and path change
  useEffect(() => {
    fetchContents(currentPath);
  }, [repo.id, currentPath]);

  // Navigate deeper into directories
  const handleItemClick = (item: SandboxContentItem) => {
    if (item.type === "dir") {
      setCurrentPath(item.path);
    } else {
      handleSelectFile(item);
    }
  };

  // Navigate to parent folder
  const handleNavigateUp = () => {
    if (!currentPath) return;
    const segments = currentPath.split("/");
    segments.pop();
    setCurrentPath(segments.join("/"));
  };

  // Navigate to arbitrary breadcrumb level
  const handleNavigateToBreadcrumb = (index: number) => {
    const segments = currentPath.split("/");
    const newPath = segments.slice(0, index + 1).join("/");
    setCurrentPath(newPath);
  };

  // Handle selecting a code file
  const handleSelectFile = async (file: SandboxContentItem) => {
    setSelectedFile(file);
    setIsLoadingFile(true);
    setFileError(null);
    setTestCode("");
    setExplanation("");
    setSuggestedAssertions([]);
    setExecutionResult(null);
    setExecutionError(null);
    setSandboxTab("test");

    try {
      const token = localStorage.getItem("github_token");
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/file?path=${encodeURIComponent(file.path)}`, { headers });
      if (!response.ok) {
        throw new Error("Failed to fetch file content.");
      }
      const data = await response.json();
      setFileContent(data.content);
      
      // Auto-trigger test generator
      handleAutoGenerateTests(file.name, data.content);
    } catch (err: any) {
      console.error(err);
      setFileError(err.message || "Could not fetch file contents from GitHub.");
      setIsLoadingFile(false);
    }
  };

  // Trigger Gemini test generation for active file
  const handleAutoGenerateTests = async (fileName: string, content: string) => {
    setIsGeneratingTests(true);
    setGenerationError(null);
    
    // Determine language from extension
    let language = "typescript";
    if (fileName.endsWith(".py")) language = "python";
    else if (fileName.endsWith(".js") || fileName.endsWith(".jsx")) language = "javascript";

    try {
      const token = localStorage.getItem("github_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/sandbox/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fileName, fileContent: content, language })
      });

      if (!response.ok) {
        throw new Error("Failed to auto-generate sandbox tests.");
      }

      const data: GeneratedTestData = await response.json();
      setTestCode(data.testCode);
      setExplanation(data.explanation || "");
      setSuggestedAssertions(data.suggestedAssertions || []);
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "Could not generate test runner.");
    } finally {
      setIsGeneratingTests(false);
      setIsLoadingFile(false);
    }
  };

  // Run the sandbox test
  const handleRunSandbox = async () => {
    if (!selectedFile) return;
    setIsExecuting(true);
    setExecutionError(null);
    setSandboxTab("terminal");

    let language = "typescript";
    if (selectedFile.name.endsWith(".py")) language = "python";
    else if (selectedFile.name.endsWith(".js") || selectedFile.name.endsWith(".jsx")) language = "javascript";

    try {
      const token = localStorage.getItem("github_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/sandbox/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileContent,
          testCode,
          language
        })
      });

      if (!response.ok) {
        throw new Error("Sandbox execution server returned an error.");
      }

      const result: ExecutionResult = await response.json();
      setExecutionResult(result);
    } catch (err: any) {
      console.error(err);
      setExecutionError(err.message || "An unexpected error occurred during execution.");
    } finally {
      setIsExecuting(false);
    }
  };

  // Close the current file sandbox
  const handleCloseSandbox = () => {
    setSelectedFile(null);
    setFileContent("");
    setTestCode("");
    setExplanation("");
    setSuggestedAssertions([]);
    setExecutionResult(null);
    setExecutionError(null);
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Split path breadcrumbs
  const getBreadcrumbs = () => {
    if (!currentPath) return [];
    return currentPath.split("/");
  };

  return (
    <div id="repo-sandbox-container" className="space-y-4">
      {/* Upper info panel */}
      <div className="bg-slate-950/60 border border-slate-850/80 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-teal-400 animate-pulse" />
            <span>Interactive Code Sandbox & Execution Runner</span>
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Run, compile, and test code modules from this repository in real-time. Choose any Javascript, TypeScript, or Python file to initialize a clean sandbox environment, run AI-generated test scenarios, and review detailed console outputs.
          </p>
        </div>
        {selectedFile && (
          <button
            onClick={handleCloseSandbox}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-stretch md:self-auto justify-center"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Back to Explorer</span>
          </button>
        )}
      </div>

      {!selectedFile ? (
        /* ================= FILE TREE EXPLORER VIEW ================= */
        <div className="border border-slate-850 bg-slate-900/40 rounded-2xl overflow-hidden">
          {/* Breadcrumbs Header */}
          <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-850 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
              <button
                onClick={() => setCurrentPath("")}
                className="text-xs font-bold text-slate-400 hover:text-teal-400 transition-colors flex-shrink-0 cursor-pointer"
              >
                {repo.name}
              </button>
              
              {getBreadcrumbs().map((seg, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-slate-600 flex-shrink-0">
                  <ChevronRight className="w-3.5 h-3.5" />
                  <button
                    onClick={() => handleNavigateToBreadcrumb(idx)}
                    className="text-xs font-bold text-slate-400 hover:text-teal-400 transition-colors cursor-pointer"
                  >
                    {seg}
                  </button>
                </div>
              ))}
            </div>

            {currentPath && (
              <button
                onClick={handleNavigateUp}
                className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Up one level</span>
              </button>
            )}
          </div>

          {/* Directory Listing */}
          <div className="divide-y divide-slate-850/50 max-h-[450px] overflow-y-auto">
            {isLoadingContents ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader className="w-7 h-7 text-teal-400 animate-spin mb-2" />
                <p className="text-xs text-slate-400">Loading directory contents...</p>
              </div>
            ) : contentsError ? (
              <div className="p-8 text-center bg-rose-950/5">
                <AlertTriangle className="w-7 h-7 text-rose-500 mx-auto mb-2" />
                <p className="text-xs text-slate-300 font-semibold">Failed to Load Directory</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">{contentsError}</p>
                <button
                  onClick={() => fetchContents(currentPath)}
                  className="mt-3 px-3 py-1 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium transition-all cursor-pointer"
                >
                  Retry Load
                </button>
              </div>
            ) : contents.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs font-medium">
                Empty folder or no files found.
              </div>
            ) : (
              // Folders first, then files
              [...contents]
                .sort((a, b) => {
                  if (a.type === b.type) return a.name.localeCompare(b.name);
                  return a.type === "dir" ? -1 : 1;
                })
                .map((item) => {
                  const isExecutable = 
                    item.name.endsWith(".ts") || 
                    item.name.endsWith(".js") || 
                    item.name.endsWith(".tsx") || 
                    item.name.endsWith(".jsx") || 
                    item.name.endsWith(".py");

                  return (
                    <div
                      key={item.path}
                      onClick={() => handleItemClick(item)}
                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-950/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.type === "dir" ? (
                          <Folder className="w-4 h-4 text-teal-500 group-hover:text-teal-400 transition-colors flex-shrink-0" />
                        ) : (
                          <File className={`w-4 h-4 flex-shrink-0 ${isExecutable ? "text-emerald-400" : "text-slate-500"}`} />
                        )}
                        <span className="text-xs font-semibold text-slate-300 group-hover:text-teal-400 transition-colors truncate">
                          {item.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {item.type === "file" && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {formatSize(item.size)}
                          </span>
                        )}
                        {item.type === "file" && isExecutable && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-950/40 text-emerald-400 border border-emerald-900/60 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            Run Sandbox
                          </span>
                        )}
                        {item.type === "dir" ? (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                        ) : null}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      ) : (
        /* ================= SANDBOX ACTIVE WORKSPACE VIEW ================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* LEFT PANEL: Selected Source File Viewer */}
          <div className="col-span-1 lg:col-span-5 flex flex-col border border-slate-850 bg-slate-900/40 rounded-2xl overflow-hidden h-[560px]">
            <div className="bg-slate-950/80 px-4 py-2.5 border-b border-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <File className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-bold text-slate-300 truncate">{selectedFile.name}</span>
              </div>
              <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded font-bold text-slate-500 uppercase tracking-widest border border-slate-850">
                Source File
              </span>
            </div>

            {isLoadingFile ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-950/20">
                <Loader className="w-7 h-7 text-teal-400 animate-spin mb-3" />
                <p className="text-xs text-slate-400">Fetching original source code...</p>
              </div>
            ) : fileError ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <AlertTriangle className="w-7 h-7 text-rose-500 mb-2" />
                <p className="text-xs font-bold text-slate-300">Could Not Read File</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs">{fileError}</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 bg-slate-950/40 font-mono text-xs">
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="flex-1 p-4 bg-slate-950/60 text-slate-300 border-none outline-none focus:ring-0 font-mono text-[11px] leading-relaxed resize-none overflow-y-auto"
                  placeholder="Loading file contents..."
                  spellCheck="false"
                />
                <div className="bg-slate-950/60 border-t border-slate-850/60 px-4 py-2 flex justify-between items-center text-[10px] text-slate-500 font-semibold">
                  <span>Editable Sandbox Instance</span>
                  <span>{fileContent.split("\n").length} Lines</span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Test Suite & Live Sandbox Console */}
          <div className="col-span-1 lg:col-span-7 flex flex-col border border-slate-850 bg-slate-900/40 rounded-2xl overflow-hidden h-[560px]">
            {/* Sandbox Header & Tabs */}
            <div className="bg-slate-950/80 border-b border-slate-850 flex flex-wrap items-center justify-between px-3">
              <div className="flex text-xs">
                <button
                  onClick={() => setSandboxTab("test")}
                  className={`flex items-center gap-1.5 px-4 py-3 font-semibold transition-all border-b-2 cursor-pointer ${
                    sandboxTab === "test"
                      ? "border-teal-500 text-teal-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>🧪 Interactive Test Suite</span>
                </button>

                <button
                  onClick={() => setSandboxTab("terminal")}
                  className={`flex items-center gap-1.5 px-4 py-3 font-semibold transition-all border-b-2 cursor-pointer ${
                    sandboxTab === "terminal"
                      ? "border-teal-500 text-teal-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>🖥️ Live Sandbox Terminal</span>
                  {executionResult && (
                    <span className={`w-1.5 h-1.5 rounded-full ${executionResult.success ? "bg-emerald-400" : "bg-rose-500 animate-ping"}`} />
                  )}
                </button>
              </div>

              <div className="py-2 px-1">
                <button
                  onClick={handleRunSandbox}
                  disabled={isExecuting || isGeneratingTests || isLoadingFile}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-950/30"
                >
                  {isExecuting ? (
                    <>
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Execute Sandbox Run</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Sandbox Content Block */}
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950/50">
              {sandboxTab === "test" && (
                <div className="flex-1 flex flex-col min-h-0">
                  {isGeneratingTests ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                      <Sparkles className="w-8 h-8 text-teal-400 animate-bounce mb-3" />
                      <h5 className="text-xs font-bold text-slate-200">AI Testing Blueprint</h5>
                      <p className="text-[11px] text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                        Gemini is analyzing the module's syntax, scanning exports, and writing a clean, executable test-assertions runner code...
                      </p>
                    </div>
                  ) : generationError ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-rose-950/5">
                      <AlertTriangle className="w-7 h-7 text-rose-500 mb-2" />
                      <p className="text-xs font-bold text-slate-300">Test Generation Failed</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-sm">{generationError}</p>
                      <button
                        onClick={() => handleAutoGenerateTests(selectedFile.name, fileContent)}
                        className="mt-4 px-3 py-1.5 bg-slate-850 text-slate-300 border border-slate-700 font-semibold rounded-lg text-[10px] cursor-pointer hover:bg-slate-800 transition-colors"
                      >
                        Retry AI Generator
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col min-h-0 divide-y divide-slate-850/60">
                      {/* Interactive Test Suite Explanation */}
                      {explanation && (
                        <div className="p-3 bg-teal-950/15 border-b border-slate-850 px-4">
                          <p className="text-[11px] text-teal-400/90 font-medium leading-relaxed">
                            <span className="font-extrabold text-teal-400 mr-1">AI Test Suite Context:</span>
                            {explanation}
                          </p>
                        </div>
                      )}

                      {/* Code Test Runner Editor */}
                      <div className="flex-1 flex flex-col min-h-0 font-mono text-xs">
                        <textarea
                          value={testCode}
                          onChange={(e) => setTestCode(e.target.value)}
                          className="flex-1 p-4 bg-slate-950/70 text-emerald-400 border-none outline-none focus:ring-0 font-mono text-[11px] leading-relaxed resize-none overflow-y-auto"
                          placeholder="Write your custom test suite/runner script here..."
                          spellCheck="false"
                        />
                        <div className="bg-slate-950/80 border-t border-slate-850/60 px-4 py-2 flex justify-between items-center text-[10px] text-slate-500 font-semibold">
                          <span>Modify imports/assertions above as desired</span>
                          <span>{testCode.split("\n").length} Lines</span>
                        </div>
                      </div>

                      {/* Suggested assertions list if present */}
                      {suggestedAssertions.length > 0 && (
                        <div className="p-3.5 bg-slate-950 max-h-[140px] overflow-y-auto">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                            Assertion Test Cases Implemented
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                            {suggestedAssertions.map((ast, idx) => (
                              <div key={idx} className="bg-slate-900 border border-slate-850/70 p-2 rounded-xl flex items-start gap-2">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold text-slate-300 block">{ast.name}</span>
                                  <span className="text-slate-500 text-[10px] leading-relaxed">{ast.description}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {sandboxTab === "terminal" && (
                <div className="flex-1 flex flex-col min-h-0 p-4 font-mono text-xs">
                  {/* Console Header */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-300">Secure Sandboxed Container Shell</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {isExecuting ? (
                        <span className="text-[10px] font-bold text-teal-400 animate-pulse flex items-center gap-1.5">
                          <Loader className="w-3 h-3 animate-spin" />
                          <span>Active Process Running</span>
                        </span>
                      ) : executionResult ? (
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{executionResult.executionTimeMs}ms</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                            <Cpu className="w-3 h-3" />
                            <span>Exit Code {executionResult.exitCode}</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1 ${executionResult.success ? "bg-emerald-950/80 text-emerald-400 border border-emerald-900/60" : "bg-rose-950/80 text-rose-400 border border-rose-900/60"}`}>
                            {executionResult.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span>{executionResult.success ? "Pass" : "Failed"}</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500">Idle / Ready</span>
                      )}
                    </div>
                  </div>

                  {/* Terminal Shell Body */}
                  <div className="flex-1 bg-slate-950/80 border border-slate-850 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-slate-300 overflow-y-auto shadow-inner flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="text-slate-500 border-b border-slate-900 pb-2">
                        <span>$ container_env init --isolated-sandbox-instance</span>
                        <br />
                        <span className="text-[10px]">Successfully provisioned. Mounted solution module. Ready for test code execution.</span>
                      </div>

                      {isExecuting && (
                        <div className="text-teal-400/90 font-bold animate-pulse">
                          <span>$ executing runner.js in isolated node micro-sandbox...</span>
                        </div>
                      )}

                      {executionError && (
                        <div className="text-rose-400 font-semibold p-2.5 bg-rose-950/15 border border-rose-900/50 rounded-lg">
                          <span>[Sandbox System Error]: {executionError}</span>
                        </div>
                      )}

                      {executionResult && (
                        <div className="space-y-3">
                          {/* STDOUT Logs */}
                          {executionResult.stdout && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Standard Output:</span>
                              <pre className="whitespace-pre-wrap text-emerald-400/90 font-mono bg-emerald-950/5 p-3 rounded-xl border border-emerald-900/20 max-h-[220px] overflow-y-auto">
                                {executionResult.stdout}
                              </pre>
                            </div>
                          )}

                          {/* STDERR Logs */}
                          {executionResult.stderr && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Standard Error / Assertion Failures:</span>
                              <pre className="whitespace-pre-wrap text-rose-400/95 font-mono bg-rose-950/5 p-3 rounded-xl border border-rose-900/20 max-h-[200px] overflow-y-auto">
                                {executionResult.stderr}
                              </pre>
                            </div>
                          )}

                          {!executionResult.stdout && !executionResult.stderr && (
                            <div className="text-slate-500 italic">
                              <span>Process exited with code {executionResult.exitCode} but generated no output streams.</span>
                            </div>
                          )}
                        </div>
                      )}

                      {!isExecuting && !executionResult && !executionError && (
                        <div className="text-slate-600 italic py-8 text-center font-semibold">
                          <span>Click "Execute Sandbox Run" above to boot the test suite.</span>
                        </div>
                      )}
                    </div>

                    <div className="text-[9px] text-slate-600 border-t border-slate-900 pt-2 flex justify-between">
                      <span>Terminated at {new Date().toLocaleTimeString()}</span>
                      <span>Secure Cloud-Native Workspace Runner</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
