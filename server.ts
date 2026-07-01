import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

// Helper to extract GitHub token from Authorization header or cookie or env
function getGitHubToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return req.cookies.github_token || process.env.GITHUB_PAT;
}

// Helper to make requests to GitHub API
async function fetchFromGitHub(endpoint: string, token: string, options: RequestInit = {}) {
  const url = endpoint.startsWith("http") ? endpoint : `https://api.github.com${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "GitHub-Dashboard-Applet",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

// 1. Auth Status - check if user is authenticated and return GitHub profile
app.get("/api/auth/status", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.json({ authenticated: false });
  }

  if (token === "demo") {
    return res.json({
      authenticated: true,
      user: {
        login: "demo",
        id: 999900,
        avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4",
        name: "Demo Developer (Sandbox Mode)",
        bio: "Simulated guest account for testing the interactive workspace & sandbox environment.",
        public_repos: 2,
        total_private_repos: 0,
        followers: 1337,
        following: 42,
        html_url: "https://github.com",
        created_at: new Date().toISOString(),
      },
    });
  }

  try {
    const profile = await fetchFromGitHub("/user", token);
    res.json({
      authenticated: true,
      user: {
        login: profile.login,
        id: profile.id,
        avatar_url: profile.avatar_url,
        name: profile.name || profile.login,
        bio: profile.bio,
        public_repos: profile.public_repos,
        total_private_repos: profile.total_private_repos || 0,
        followers: profile.followers,
        following: profile.following,
        html_url: profile.html_url,
        created_at: profile.created_at,
      },
    });
  } catch (error: any) {
    console.error("Auth status error:", error.message);
    // Token might be expired or revoked, clear it
    res.clearCookie("github_token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.json({ authenticated: false, error: "Token invalid or expired" });
  }
});

// 2. Get Auth URL - construct GitHub authorize URL
app.get("/api/auth/url", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({
      error: "GitHub Client ID is not configured on the server. Please check environment variables.",
    });
  }

  const redirectUri = `${process.env.APP_URL || "http://localhost:3000"}/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user repo",
  });

  res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
});

// 2.5. Demo Mode login endpoint
app.post("/api/auth/demo", (req, res) => {
  res.cookie("github_token", "demo", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
  res.json({
    success: true,
    token: "demo",
    user: {
      login: "demo",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4",
      name: "Demo Developer (Sandbox Mode)",
    }
  });
});

// 3. Connect via PAT (Personal Access Token) - verifying and setting cookie
app.post("/api/auth/token", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  if (token === "demo" || token.trim() === "demo") {
    res.cookie("github_token", "demo", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    return res.json({
      success: true,
      token: "demo",
      user: {
        login: "demo",
        avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4",
        name: "Demo Developer (Sandbox Mode)",
      },
    });
  }

  try {
    // Verify the token by calling /user
    const profile = await fetchFromGitHub("/user", token);
    
    // Set cookie
    res.cookie("github_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      success: true,
      token: token,
      user: {
        login: profile.login,
        avatar_url: profile.avatar_url,
        name: profile.name || profile.login,
      },
    });
  } catch (error: any) {
    res.status(401).json({ error: "Invalid Personal Access Token" });
  }
});

// 4. Logout - clear the cookie
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("github_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ success: true });
});

// 5. OAuth Callback
app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Authorization code is missing");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send("GitHub Client ID or Client Secret is not configured on the server.");
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${process.env.APP_URL || "http://localhost:3000"}/auth/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }

    const tokenData: any = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error(tokenData.error_description || "Could not retrieve access token from GitHub");
    }

    // Set cookie
    res.cookie("github_token", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Send success script to close popup and notify parent
    res.send(`
      <!doctype html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background-color: #0f172a;
              color: #f8fafc;
              text-align: center;
            }
            .card {
              background-color: #1e293b;
              padding: 2.5rem;
              border-radius: 1rem;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
              max-width: 400px;
            }
            h2 { color: #10b981; margin-top: 0; }
            p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
            .spinner {
              border: 3px solid #334155;
              border-top: 3px solid #10b981;
              border-radius: 50%;
              width: 30px;
              height: 30px;
              animation: spin 1s linear infinite;
              margin: 1.5rem auto 0;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Connection Successful!</h2>
            <p>You have successfully authenticated with GitHub. This window will close automatically and return you to the dashboard.</p>
            <div class="spinner"></div>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: "OAUTH_AUTH_SUCCESS", token: "${accessToken}" }, "*");
              setTimeout(() => {
                window.close();
              }, 1000);
            } else {
              window.location.href = "/";
            }
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Callback error:", error);
    res.status(500).send(`
      <!doctype html>
      <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background-color: #0f172a;
              color: #f8fafc;
              text-align: center;
            }
            .card {
              background-color: #1e293b;
              padding: 2.5rem;
              border-radius: 1rem;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
              max-width: 450px;
              border: 1px solid #ef4444;
            }
            h2 { color: #ef4444; margin-top: 0; }
            p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem; }
            .btn {
              background-color: #ef4444;
              color: white;
              padding: 0.5rem 1.5rem;
              border-radius: 0.375rem;
              text-decoration: none;
              font-weight: 500;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication Failed</h2>
            <p>An error occurred while connecting to GitHub: ${error.message || "Unknown error"}</p>
            <a href="#" class="btn" onclick="window.close(); return false;">Close Window</a>
          </div>
        </body>
      </html>
    `);
  }
});

// 6. Proxy GET User Repositories
app.get("/api/github/repos", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (token === "demo") {
    return res.json([
      {
        id: 999901,
        name: "demo-algorithms-python",
        full_name: "demo/demo-algorithms-python",
        owner: {
          login: "demo",
          avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
        },
        description: "A collection of python algorithmic and math modules for sandbox testing.",
        html_url: "https://github.com/demo/demo-algorithms-python",
        stargazers_count: 42,
        forks_count: 7,
        open_issues_count: 0,
        updated_at: new Date().toISOString()
      },
      {
        id: 999902,
        name: "demo-utils-typescript",
        full_name: "demo/demo-utils-typescript",
        owner: {
          login: "demo",
          avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
        },
        description: "A collection of modern TypeScript helper utilities and data structures.",
        html_url: "https://github.com/demo/demo-utils-typescript",
        stargazers_count: 128,
        forks_count: 15,
        open_issues_count: 2,
        updated_at: new Date().toISOString()
      }
    ]);
  }

  try {
    const repos = await fetchFromGitHub("/user/repos?sort=updated&per_page=100", token);
    res.json(repos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6.5. Proxy GET single Repository details (custom fetch)
app.get("/api/github/repos/:owner/:repo", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { owner, repo } = req.params;

  if (token === "demo") {
    const isPy = repo.includes("python");
    return res.json({
      id: isPy ? 999901 : 999902,
      name: repo,
      full_name: `demo/${repo}`,
      owner: {
        login: "demo",
        avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
      },
      description: isPy ? "A collection of python algorithmic and math modules for sandbox testing." : "A collection of modern TypeScript helper utilities and data structures.",
      html_url: `https://github.com/demo/${repo}`,
      stargazers_count: isPy ? 42 : 128,
      forks_count: isPy ? 7 : 15,
      open_issues_count: isPy ? 0 : 2,
      updated_at: new Date().toISOString()
    });
  }

  try {
    const repository = await fetchFromGitHub(`/repos/${owner}/${repo}`, token);
    res.json(repository);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Proxy GET Repository Details (Commits, Issues, PRs)
app.get("/api/github/repos/:owner/:repo/details", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { owner, repo } = req.params;

  if (token === "demo") {
    return res.json({
      commits: [
        {
          sha: "a1b2c3d4e5f6g7h8i9j0",
          commit: {
            message: "Initial commit with core utilities and documentation",
            author: {
              name: "Demo Developer",
              email: "demo@example.com",
              date: new Date(Date.now() - 3600000 * 24 * 2).toISOString()
            }
          },
          html_url: "https://github.com"
        },
        {
          sha: "f9e8d7c6b5a432109876",
          commit: {
            message: "Optimized functions & fixed boundary conditions in sandbox",
            author: {
              name: "Demo Developer",
              email: "demo@example.com",
              date: new Date(Date.now() - 3600000 * 12).toISOString()
            }
          },
          html_url: "https://github.com"
        }
      ],
      issues: [
        {
          id: 1,
          number: 101,
          title: "Optimize performance for ultra-high-range datasets",
          state: "open",
          user: { login: "tester-pro" },
          created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
          html_url: "https://github.com"
        }
      ],
      pulls: [
        {
          id: 2,
          number: 102,
          title: "Feature/add-robust-error-handling-and-logging",
          state: "open",
          user: { login: "contributor-one" },
          created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
          html_url: "https://github.com"
        }
      ]
    });
  }

  try {
    const [commits, issues, pulls] = await Promise.all([
      fetchFromGitHub(`/repos/${owner}/${repo}/commits?per_page=10`, token).catch(() => []),
      fetchFromGitHub(`/repos/${owner}/${repo}/issues?state=open&per_page=10`, token).catch(() => []),
      fetchFromGitHub(`/repos/${owner}/${repo}/pulls?state=open&per_page=10`, token).catch(() => []),
    ]);

    res.json({
      commits,
      // Since GitHub issues API returns both issues and PRs, filter out PRs from issues list
      issues: Array.isArray(issues) ? issues.filter((item: any) => !item.pull_request) : [],
      pulls,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7.1. Proxy GET Repository contents (files and directories)
app.get("/api/github/repos/:owner/:repo/contents", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { owner, repo } = req.params;
  const pathParam = req.query.path as string || "";

  if (token === "demo") {
    if (repo === "demo-algorithms-python") {
      return res.json([
        { name: "math_utils.py", path: "math_utils.py", type: "file", size: 550, html_url: "https://github.com" }
      ]);
    } else {
      return res.json([
        { name: "array_utils.ts", path: "array_utils.ts", type: "file", size: 450, html_url: "https://github.com" },
        { name: "event_emitter.ts", path: "event_emitter.ts", type: "file", size: 680, html_url: "https://github.com" }
      ]);
    }
  }

  try {
    const contents = await fetchFromGitHub(`/repos/${owner}/${repo}/contents/${pathParam}`, token);
    res.json(contents);
  } catch (error: any) {
    console.error("Fetch contents error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 7.2. Proxy GET raw file content
app.get("/api/github/repos/:owner/:repo/file", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { owner, repo } = req.params;
  const filePath = req.query.path as string;

  if (!filePath) {
    return res.status(400).json({ error: "Path query parameter is required" });
  }

  if (token === "demo") {
    let content = "";
    if (filePath === "math_utils.py") {
      content = `def fibonacci(n):
    """
    Returns the nth Fibonacci number.
    """
    if n < 0:
        raise ValueError("Fibonacci is not defined for negative integers.")
    if n == 0:
        return 0
    if n == 1:
        return 1
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

def is_prime(n):
    """
    Returns True if n is prime, False otherwise.
    """
    if n <= 1:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True
`;
    } else if (filePath === "array_utils.ts") {
      content = `/**
 * Sorts an array of objects by a specific key.
 */
export function sortByProperty<T>(arr: T[], key: keyof T, ascending: boolean = true): T[] {
  return [...arr].sort((a, b) => {
    if (a[key] < b[key]) return ascending ? -1 : 1;
    if (a[key] > b[key]) return ascending ? 1 : -1;
    return 0;
  });
}

/**
 * Deduplicates array items based on value or custom primitive selector.
 */
export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
`;
    } else if (filePath === "event_emitter.ts") {
      content = `export class EventEmitter {
  private events: { [key: string]: Function[] } = {};

  on(event: string, listener: Function): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  off(event: string, listener: Function): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event: string, ...args: any[]): void {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => {
      try {
        listener(...args);
      } catch (e) {
        console.error(\`Error in event listener for \${event}:\`, e);
      }
    });
  }
}
`;
    } else {
      return res.status(404).json({ error: "File not found in demo repository." });
    }

    return res.json({
      content,
      size: content.length,
      sha: "demo-sha-placeholder"
    });
  }

  try {
    const fileData = await fetchFromGitHub(`/repos/${owner}/${repo}/contents/${filePath}`, token);
    if (fileData.type !== "file") {
      return res.status(400).json({ error: "Specified path is not a file" });
    }
    const content = Buffer.from(fileData.content, "base64").toString("utf8");
    res.json({ content, size: fileData.size, sha: fileData.sha });
  } catch (error: any) {
    console.error("Fetch file error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 7.3. Generate Unit Tests / Run Simulation script for a selected file
app.post("/api/github/repos/:owner/:repo/sandbox/generate", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { owner, repo } = req.params;
  const { fileName, fileContent, language } = req.body;

  if (!fileName || !fileContent) {
    return res.status(400).json({ error: "fileName and fileContent are required" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Return a basic template if Gemini is not configured
      const defaultScript = language === "python" 
        ? `import solution\n\n# Fallback test script\nprint("Executing solution in sandbox...")\n# Add your assertions here`
        : `import * as solution from "./solution";\n\nconsole.log("Executing solution in sandbox...");\n// Add your assertions here`;
      return res.json({
        testCode: defaultScript,
        explanation: "No Gemini API key detected. Using default fallback runner script.",
        suggestedAssertions: []
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });

    const systemInstruction = `You are an elite test engineer. Your task is to analyze a code file written in ${language || "TypeScript/JavaScript"} and write a high-quality, self-contained test runner script that tests its core functions.
The target code will be saved in a file named "solution" with the appropriate extension (e.g. solution.ts, solution.js, solution.py).
Your generated test code MUST import from './solution' or import solution, execute several tests including edge cases, print detailed success/failure logs, and then assert the results.
For TypeScript/JavaScript, use standard modern ES imports or Node syntax. For Python, use standard import.
Return your response strictly in JSON format matching the schema provided. Make sure the test script is comprehensive and prints clean outputs.`;

    const prompt = `Please analyze this file: "${fileName}" and generate a test runner script.
File contents:
\`\`\`
${fileContent}
\`\`\`
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["testCode", "explanation", "suggestedAssertions"],
          properties: {
            testCode: {
              type: Type.STRING,
              description: "The complete executable test runner script that imports and tests 'solution'. Print clear status lines for each test case.",
            },
            explanation: {
              type: Type.STRING,
              description: "Brief overview of what this test suite covers.",
            },
            suggestedAssertions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["name", "description", "expectedBehavior"],
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  expectedBehavior: { type: Type.STRING }
                }
              },
              description: "List of the specific test cases handled in the generated code."
            }
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("No response received from Gemini.");
    }

    res.json(JSON.parse(response.text.trim()));
  } catch (error: any) {
    console.error("Test generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate tests." });
  }
});

// 7.4. Run tests in sandbox
app.post("/api/github/repos/:owner/:repo/sandbox/run", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { fileName, fileContent, testCode, language } = req.body;

  if (!fileContent || !testCode) {
    return res.status(400).json({ error: "fileContent and testCode are required" });
  }

  // Create a unique temporary directory
  const tempDirName = `sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tempDir = path.join(process.cwd(), "tmp", tempDirName);

  try {
    // Ensure tmp directory exists
    await fs.promises.mkdir(tempDir, { recursive: true });

    let solutionFileName = "solution.ts";
    let runnerFileName = "test_runner.ts";
    let runCommand = "";

    if (language === "python" || fileName.endsWith(".py")) {
      solutionFileName = "solution.py";
      runnerFileName = "test_runner.py";
      runCommand = `python3 ${runnerFileName}`;
    } else if (language === "javascript" || fileName.endsWith(".js") || fileName.endsWith(".jsx")) {
      solutionFileName = "solution.js";
      runnerFileName = "test_runner.js";
      runCommand = `npx tsx ${runnerFileName}`;
    } else {
      // TypeScript by default
      solutionFileName = "solution.ts";
      runnerFileName = "test_runner.ts";
      runCommand = `npx tsx ${runnerFileName}`;
    }

    // Write the original solution file
    await fs.promises.writeFile(path.join(tempDir, solutionFileName), fileContent, "utf8");

    // Write the test runner file
    await fs.promises.writeFile(path.join(tempDir, runnerFileName), testCode, "utf8");

    // Execute with a timeout of 10 seconds to prevent infinite loops
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    let timedOut = false;

    try {
      const { stdout: out, stderr: err } = await execAsync(runCommand, {
        cwd: tempDir,
        timeout: 10000, // 10s timeout
        env: { ...process.env, NODE_ENV: "production" }
      });
      stdout = out;
      stderr = err;
    } catch (execError: any) {
      stdout = execError.stdout || "";
      stderr = execError.stderr || execError.message || "";
      exitCode = execError.code !== undefined ? execError.code : -1;
      if (execError.killed || execError.signal === "SIGTERM") {
        timedOut = true;
        stderr += "\n[Error] Sandbox execution timed out after 10 seconds (potential infinite loop or slow network).";
      }
    }

    const duration = Date.now() - startTime;

    res.json({
      success: exitCode === 0 && !timedOut,
      stdout,
      stderr,
      exitCode,
      executionTimeMs: duration,
      timedOut
    });

  } catch (error: any) {
    console.error("Sandbox execution error:", error);
    res.status(500).json({ error: error.message || "Failed to execute sandbox run." });
  } finally {
    // Clean up temp files recursively
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
  }
});

// 8. Run AI-Powered Audit on a Repository
app.get("/api/github/repos/:owner/:repo/audit", async (req, res) => {
  const token = getGitHubToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { owner, repo } = req.params;

  if (token === "demo") {
    // Return high quality mock audit report for the demo repositories
    const isPy = repo.includes("python");
    return res.json({
      score: 95,
      summary: `The demo repository ${repo} has excellent coverage and code health. Standard module validation and sandboxed run tests successfully compiled and passed with 0 warnings.`,
      strengths: [
        "Highly clean and modular functional structure with rich documentation",
        "No external bloated dependencies detected",
        "Fully typed outputs and clear assertion scopes"
      ],
      findings: [
        {
          id: 1,
          severity: "low",
          title: "Add more comprehensive edge case assertions",
          category: "Security & Validation",
          description: "While the primary execution logic handles integers and common standard arrays, adding strict runtime type-guards or exception handlers is recommended for extreme edge cases.",
          impact: "Slightly unhandled boundary conditions when dealing with non-standard primitive structures.",
          remediation: "Include explicit bounds checks at the start of your functions."
        }
      ]
    });
  }

  try {
    // 1. Fetch Repository General Metadata
    const repoData = await fetchFromGitHub(`/repos/${owner}/${repo}`, token);

    // 2. Fetch root directory files to check structure
    const rootContents = await fetchFromGitHub(`/repos/${owner}/${repo}/contents`, token).catch(() => []);
    const rootFiles = Array.isArray(rootContents) ? rootContents.map((f: any) => ({ name: f.name, type: f.type, size: f.size })) : [];

    // 3. Fetch package.json content if it exists
    let packageJsonContent = "";
    const packageJsonFile = Array.isArray(rootContents) ? rootContents.find((f: any) => f.name.toLowerCase() === "package.json") : null;
    if (packageJsonFile) {
      const packageJsonData = await fetchFromGitHub(`/repos/${owner}/${repo}/contents/${packageJsonFile.name}`, token).catch(() => null);
      if (packageJsonData && packageJsonData.content) {
        packageJsonContent = Buffer.from(packageJsonData.content, "base64").toString("utf8");
      }
    }

    // 4. Fetch README.md content if it exists
    let readmeSnippet = "";
    const readmeFile = Array.isArray(rootContents) ? rootContents.find((f: any) => f.name.toLowerCase() === "readme.md") : null;
    if (readmeFile) {
      const readmeData = await fetchFromGitHub(`/repos/${owner}/${repo}/contents/${readmeFile.name}`, token).catch(() => null);
      if (readmeData && readmeData.content) {
        const fullReadme = Buffer.from(readmeData.content, "base64").toString("utf8");
        readmeSnippet = fullReadme.slice(0, 1500); // Send first 1500 characters
      }
    }

    // 5. Check for Gemini API key and initialize
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not configured. Running fallback heuristic audit.");
      return res.json(generateHeuristicAudit(repoData, rootFiles, packageJsonContent));
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const systemInstruction = `You are an elite automated repository auditor and principal software engineer. Your job is to analyze the metadata, file structure, and key files of a GitHub repository and generate an exhaustive, professional, and highly actionable audit report.
Return your audit report strictly in JSON format matching the specified schema. Be rigorous, identify any possible security risks, architectural issues, outdated dependencies, missing config files, or documentation issues. Give practical, step-by-step remediation commands.`;

    const contents = `
Please audit the following repository:
Owner: ${owner}
Repository Name: ${repo}
Description: ${repoData.description || "No description provided"}
Primary Language: ${repoData.language || "Unknown"}
Topics: ${JSON.stringify(repoData.topics || [])}
Size: ${repoData.size} KB
Forks: ${repoData.forks_count}
Stars: ${repoData.stargazers_count}
Open Issues: ${repoData.open_issues_count}

--- Root Directory Files ---
${JSON.stringify(rootFiles, null, 2)}

--- package.json Content (if applicable) ---
${packageJsonContent || "Not present in root"}

--- README.md Snippet (if applicable) ---
${readmeSnippet || "Not present in root"}
`;

    const geminiResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["score", "summary", "strengths", "findings"],
          properties: {
            score: {
              type: Type.INTEGER,
              description: "Overall health/quality score of the repository from 0 to 100.",
            },
            summary: {
              type: Type.STRING,
              description: "A professional high-level summary of the repository status and health.",
            },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of positive traits or well-implemented features in the repo.",
            },
            findings: {
              type: Type.ARRAY,
              description: "List of identified vulnerabilities, warning areas, or improvements.",
              items: {
                type: Type.OBJECT,
                required: ["severity", "category", "title", "description", "remediation"],
                properties: {
                  severity: {
                    type: Type.STRING,
                    description: "Severity level of this finding.",
                  },
                  category: {
                    type: Type.STRING,
                    description: "Category of the finding (e.g., Security, Structure, Dependencies, Quality, Documentation).",
                  },
                  title: {
                    type: Type.STRING,
                    description: "A short, descriptive title of the issue.",
                  },
                  description: {
                    type: Type.STRING,
                    description: "Detailed analysis of why this is an issue and its potential impact.",
                  },
                  remediation: {
                    type: Type.STRING,
                    description: "Clear, step-by-step resolution advice, including commands if applicable.",
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!geminiResponse.text) {
      throw new Error("No response received from Gemini.");
    }

    const report = JSON.parse(geminiResponse.text.trim());
    res.json(report);

  } catch (error: any) {
    console.error("Audit error:", error);
    res.status(500).json({ error: error.message || "An error occurred during the repository audit." });
  }
});

// Heuristic fallback audit function when GEMINI_API_KEY is not defined
function generateHeuristicAudit(repoData: any, rootFiles: any[], packageJsonContent: string) {
  const fileNames = rootFiles.map(f => f.name.toLowerCase());
  const findings: any[] = [];
  let score = 90;

  // 1. Documentation check
  const hasReadme = fileNames.some(f => f === "readme.md" || f === "readme");
  if (!hasReadme) {
    score -= 15;
    findings.push({
      severity: "critical",
      category: "Documentation",
      title: "Missing README.md File",
      description: "No README file was found in the root of the repository. A README is essential for users and contributors to understand what the project is and how to get started.",
      remediation: "Create a README.md file in the root directory detailing the project title, description, installation instructions, and usage guide."
    });
  } else {
    findings.push({
      severity: "info",
      category: "Documentation",
      title: "README.md File Exists",
      description: "A README file is present, which is great for project onboarding and documentation.",
      remediation: "Ensure the README is up-to-date with installation, contribution, and deployment guides."
    });
  }

  // 2. License check
  const hasLicense = fileNames.some(f => f.includes("license") || f === "copying");
  if (!hasLicense) {
    score -= 10;
    findings.push({
      severity: "warning",
      category: "Documentation",
      title: "Missing LICENSE File",
      description: "No LICENSE file was detected in the root of the repository. Without a license, the project defaults to exclusive copyright, meaning others cannot legally use, modify, or distribute your code.",
      remediation: "Add an open-source license (like MIT, Apache-2.0, or GPL-3.0) by creating a LICENSE file in the root."
    });
  }

  // 3. .gitignore check
  const hasGitignore = fileNames.some(f => f === ".gitignore");
  if (!hasGitignore) {
    score -= 15;
    findings.push({
      severity: "critical",
      category: "Security",
      title: "Missing .gitignore File",
      description: "No .gitignore file was found in the root directory. This dramatically increases the risk of checking in sensitive credentials (.env), build artifacts (dist, build), or heavy third-party folders (node_modules).",
      remediation: "Create a .gitignore file immediately and add rules for node_modules/, dist/, .env, and OS-specific files."
    });
  }

  // 4. TSConfig check if language is TypeScript
  if (repoData.language?.toLowerCase() === "typescript" && !fileNames.some(f => f === "tsconfig.json")) {
    score -= 10;
    findings.push({
      severity: "warning",
      category: "Structure",
      title: "Missing tsconfig.json in TypeScript Project",
      description: "The primary language is identified as TypeScript, but no tsconfig.json file was found in the root directory. This may cause compiler configuration inconsistencies.",
      remediation: "Initialize a TypeScript configuration using 'npx tsc --init' and configure target, module resolution, and strict mode."
    });
  }

  // 5. Environmental variable documentation check
  const hasEnvExample = fileNames.some(f => f === ".env.example" || f === ".env.sample");
  const hasEnv = fileNames.some(f => f === ".env");
  if (hasEnv) {
    score -= 20;
    findings.push({
      severity: "critical",
      category: "Security",
      title: "Sensitive .env File Checked Into Git",
      description: "An active .env file was detected in the repository root contents list. Credentials, API keys, and secrets should NEVER be committed to version control.",
      remediation: "Run 'git rm --cached .env' to untrack the file. Then add '.env' to your .gitignore, and commit the changes."
    });
  } else if (packageJsonContent && !hasEnvExample) {
    findings.push({
      severity: "warning",
      category: "Security",
      title: "Missing .env.example Template",
      description: "The project uses dependencies but does not supply a .env.example file. Developers onboarding to the project won't easily know which environment variables are required.",
      remediation: "Create a .env.example file template showing the keys of required environment variables without committing any actual private values."
    });
  }

  // 6. Outdated dependencies check (heuristics on package.json if present)
  if (packageJsonContent) {
    try {
      const pJson = JSON.parse(packageJsonContent);
      const deps = { ...(pJson.dependencies || {}), ...(pJson.devDependencies || {}) };
      
      const oldDeps = [];
      if (deps["express"] && deps["express"].startsWith("^3")) oldDeps.push("express");
      if (deps["react"] && deps["react"].startsWith("^16")) oldDeps.push("react (v16)");

      if (oldDeps.length > 0) {
        score -= 10;
        findings.push({
          severity: "warning",
          category: "Dependencies",
          title: "Outdated Dependency Versions Detected",
          description: `The project contains older major versions of: ${oldDeps.join(", ")}. Legacy dependencies increase the risk of unpatched vulnerabilities and limit integration with modern tooling.`,
          remediation: "Run 'npm outdated' to see fully detailed suggestions, and upgrade safely using 'npm install <package>@latest'."
        });
      }
    } catch (e) {}
  }

  // Cap score bounds
  score = Math.max(10, Math.min(score, 100));

  const strengths = [
    "Repository is active and tracked with standard Git version control.",
    repoData.language ? `Primary codebase language is set as ${repoData.language}.` : "Repository language categorization is active."
  ];
  if (hasReadme) strengths.push("Documentation template is present with README.md.");
  if (!hasEnv) strengths.push("Secure practice: No raw .env file committed in public file list.");

  return {
    score,
    summary: `Heuristic pre-audit completed for ${repoData.full_name || repoData.name}. The repository is primarily written in ${repoData.language || "code"}. It scored ${score}/100 based on standard root directory structural heuristics.`,
    strengths,
    findings
  };
}

// Server boot and Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
