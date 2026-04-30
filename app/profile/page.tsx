"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import AppMenu from "@/components/AppMenu";
import { isRecoverableAuthError } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

function getHandle(user: User | null) {
  return user?.email ? user.email.split("@")[0] : "익명 계정";
}

export default function ProfilePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      let currentUser: User | null = null;

      try {
        const { data } = await supabase.auth.getSession();
        currentUser = data.session?.user ?? null;
      } catch (error) {
        if (isRecoverableAuthError(error)) {
          console.warn("Recoverable auth session error on profile. Resetting local session.", error);
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch (signOutError) {
            console.warn("Profile local auth session reset failed:", signOutError);
          }
        } else {
          console.warn("Failed to load profile auth session:", error);
        }
      }

      if (cancelled) {
        return;
      }

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setAuthUser(currentUser);
      setIsLoading(false);
    }

    void loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      let currentUser: User | null = null;

      try {
        currentUser = session?.user ?? null;
      } catch (error) {
        if (isRecoverableAuthError(error)) {
          console.warn("Recoverable auth state error on profile. Resetting local session.", error);
          void supabase.auth
            .signOut({ scope: "local" })
            .catch((signOutError) =>
              console.warn("Profile local auth state reset failed:", signOutError)
            );
        } else {
          console.warn("Profile auth state handling failed:", error);
        }
      }

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setAuthUser(currentUser);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  async function handlePasswordUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newPassword.trim() || newPassword.length < 6) {
      setMessage("새 비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      setMessage("비밀번호가 변경되었습니다.");
    } catch (error) {
      console.warn("Failed to update password:", error);
      setMessage("비밀번호 변경에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.45),_rgba(248,250,252,1)_34%,_rgba(226,232,240,0.9)_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
        <AppMenu compact />
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
          <div className="rounded-3xl border border-white/70 bg-white/80 px-6 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur">
            정보를 불러오는 중입니다.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.45),_rgba(248,250,252,1)_34%,_rgba(226,232,240,0.9)_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <AppMenu compact />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[32px] border border-white/70 bg-white/80 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">정보수정</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              계정 관리
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              현재 아이디는 <span className="font-semibold text-slate-900">{getHandle(authUser)}</span> 입니다.
            </p>
          </div>

          <div className="grid gap-8 px-6 py-6 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">기본 정보</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">내 계정</h2>
              </div>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">아이디</p>
                  <p className="mt-1 font-medium text-slate-900">{getHandle(authUser)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href="/" className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600">
                  지도로 이동
                </Link>
                <Link href="/login" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                  로그인
                </Link>
              </div>
            </section>

            <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">비밀번호 변경</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">정보 수정</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  새 비밀번호를 입력하면 바로 변경됩니다.
                </p>
              </div>

              <form className="space-y-3" onSubmit={handlePasswordUpdate}>
                <input
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  placeholder="새 비밀번호"
                  minLength={6}
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-sky-400"
                />
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  placeholder="새 비밀번호 확인"
                  minLength={6}
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-sky-400"
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSaving ? "변경 중" : "비밀번호 변경"}
                </button>
              </form>

              {message ? (
                <p className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
                  {message}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
