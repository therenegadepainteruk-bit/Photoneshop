import { GitHubUser } from "../types";
import { LogOut, Users, BookOpen, ExternalLink, CalendarDays } from "lucide-react";

interface UserProfileCardProps {
  user: GitHubUser;
  onLogout: () => Promise<void>;
  isLoggingOut: boolean;
}

export default function UserProfileCard({
  user,
  onLogout,
  isLoggingOut,
}: UserProfileCardProps) {
  const joinDate = new Date(user.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  return (
    <div id="user-profile-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      {/* Absolute faint background ornament */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 blur-3xl rounded-full" />

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        {/* Avatar */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-teal-500 to-blue-500 rounded-full blur opacity-40 group-hover:opacity-70 transition duration-500" />
          <img
            src={user.avatar_url}
            alt={user.name}
            referrerPolicy="no-referrer"
            className="relative w-20 h-20 rounded-full object-cover border-2 border-slate-900"
          />
        </div>

        {/* User Details */}
        <div className="flex-1 text-center sm:text-left space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center justify-center sm:justify-start gap-1.5">
                {user.name}
              </h2>
              <a
                href={user.html_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-teal-400 hover:text-teal-300 transition-colors inline-flex items-center gap-1 group"
              >
                @{user.login}
                <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>
            </div>

            <button
              id="logout-button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-850 disabled:opacity-50 text-slate-300 hover:text-rose-400 border border-slate-700/60 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer self-center sm:self-start"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isLoggingOut ? "Disconnecting..." : "Disconnect"}</span>
            </button>
          </div>

          {user.bio ? (
            <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
              {user.bio}
            </p>
          ) : (
            <p className="text-sm text-slate-500 italic">No biography provided.</p>
          )}

          {/* User Meta (Join date) */}
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-slate-500 font-medium">
            <CalendarDays className="w-3.5 h-3.5 text-slate-600" />
            <span>Joined {joinDate}</span>
          </div>
        </div>
      </div>

      {/* Profile metrics stats layout */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-slate-850">
        <div className="text-center p-3 bg-slate-950/40 border border-slate-850/40 rounded-xl">
          <div className="flex justify-center mb-1">
            <BookOpen className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-lg font-bold text-slate-100">{user.public_repos}</div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Public Repos</div>
        </div>

        <div className="text-center p-3 bg-slate-950/40 border border-slate-850/40 rounded-xl">
          <div className="flex justify-center mb-1">
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-slate-100">{user.followers}</div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Followers</div>
        </div>

        <div className="text-center p-3 bg-slate-950/40 border border-slate-850/40 rounded-xl">
          <div className="flex justify-center mb-1">
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-slate-100">{user.following}</div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Following</div>
        </div>
      </div>
    </div>
  );
}
