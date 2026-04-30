"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AppMenuProps = {
  compact?: boolean;
};

function getHandle(user: User | null) {
  return user?.email ? user.email.split("@")[0] : null;
}

export default function AppMenu({ compact = false }: AppMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();

      if (!cancelled) {
        setAuthUser(data.session?.user ?? null);
      }
    }

    void loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setIsOpen(false);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-[60] h-16 border-b border-white/70 bg-white/90 px-4 pt-4 shadow-sm shadow-slate-200/60 backdrop-blur sm:left-4 sm:right-auto sm:top-4 sm:h-auto sm:w-auto sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none ${
        compact ? "" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-slate-900 shadow-lg shadow-slate-200/60 backdrop-blur transition hover:bg-white"
        aria-label="메뉴 열기"
        aria-expanded={isOpen}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {isOpen ? (
        <div className="mt-3 w-[calc(100vw-2rem)] max-w-72 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <div className="border-b border-slate-100 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">메뉴</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
              {authUser ? getHandle(authUser) ?? "익명 계정" : "Travel Map Diary"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {authUser ? "계정과 기록을 관리하세요." : "로그인하거나 새 계정을 만들어 시작하세요."}
            </p>
          </div>

          <div className="p-2">
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span>지도 홈</span>
              <span className="text-slate-400">→</span>
            </Link>

            {authUser ? (
              <Link
                href="/profile"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <span>정보수정</span>
                <span className="text-slate-400">→</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <span>로그인</span>
                  <span className="text-slate-400">→</span>
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <span>회원가입</span>
                  <span className="text-slate-400">→</span>
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={handleLogout}
              disabled={!authUser || isSigningOut}
              className="mt-1 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <span>{isSigningOut ? "로그아웃 중" : "로그아웃"}</span>
              <span className="text-rose-300">↗</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
