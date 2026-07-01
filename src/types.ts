export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string;
  bio: string | null;
  public_repos: number;
  total_private_repos: number;
  followers: number;
  following: number;
  html_url: string;
  created_at: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  updated_at: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  author: {
    login: string;
    avatar_url: string;
  } | null;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  comments: number;
  user: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
}

export interface RepoDetails {
  commits: GitHubCommit[];
  issues: GitHubIssue[];
  pulls: GitHubPullRequest[];
}

export interface AuditFinding {
  severity: "critical" | "warning" | "low" | "info";
  category: "Security" | "Structure" | "Dependencies" | "Quality" | "Documentation";
  title: string;
  description: string;
  remediation: string;
}

export interface AuditReport {
  score: number;
  summary: string;
  strengths: string[];
  findings: AuditFinding[];
}
