"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { buildAuthEmail, buildAuthEmailCandidates, validateAuthHandle } from "@/lib/auth";
import AppMenu from "@/components/AppMenu";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  mode: AuthMode;
};

function getSuccessMessage(mode: AuthMode) {
  return mode === "login" ? "로그인되었습니다." : "회원가입이 완료되었습니다.";
}

function getHeading(mode: AuthMode) {
  return mode === "login" ? "로그인" : "회원가입";
}

function getDescription(mode: AuthMode) {
  return mode === "login"
    ? "아이디와 비밀번호로 내 여행 지도를 이어가세요."
    : "새 아이디를 만들어 개인 여행 기록을 시작하세요.";
}

function getSubmitLabel(mode: AuthMode) {
  return mode === "login" ? "로그인" : "회원가입";
}

function getSecondaryLink(mode: AuthMode) {
  return mode === "login"
    ? { href: "/signup", label: "회원가입으로 이동" }
    : { href: "/login", label: "로그인으로 이동" };
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authHandle, setAuthHandle] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [message, setMessage] = useState<string | null>(
    mode === "login" && searchParams.get("signup") === "success"
      ? "회원가입이 완료되었습니다. 로그인해주세요."
      : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function redirectIfAuthenticated() {
      const { data } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      if (data.session) {
        router.replace("/");
        router.refresh();
        return;
      }

      setIsCheckingSession(false);
    }

    void redirectIfAuthenticated();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const handleError = validateAuthHandle(authHandle);
    if (handleError) {
      setMessage(handleError);
      return;
    }

    if (authHandle.trim().length === 0) {
      setMessage("아이디를 입력하세요.");
      return;
    }

    if (!authPassword.trim()) {
      setMessage("비밀번호를 입력하세요.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const email = buildAuthEmail(authHandle);

      if (mode === "login") {
        let lastLoginError: Error | null = null;

        for (const loginEmail of buildAuthEmailCandidates(authHandle)) {
          const { error } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password: authPassword,
          });

          if (!error) {
            setMessage(getSuccessMessage(mode));
            router.replace("/");
            router.refresh();
            return;
          }

          lastLoginError = error;

          if (!/invalid login credentials/i.test(error.message)) {
            throw error;
          }
        }

        throw lastLoginError ?? new Error("로그인에 실패했습니다.");
      }

      const { data: existingUserId, error: lookupError } = await supabase.rpc("get_user_id_by_handle", {
        target_handle: authHandle,
      });

      if (lookupError) {
        throw lookupError;
      }

      if (existingUserId) {
        throw new Error("already registered");
      }

      const emailRedirectTo = `${window.location.origin}/login`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password: authPassword,
        options: {
          emailRedirectTo,
        },
      });

      if (error) throw error;

      if (data.session) {
        await supabase.auth.signOut();
      }

      router.replace("/login?signup=success");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "인증에 실패했습니다.";

      if (/already registered|duplicate|exist/i.test(messageText)) {
        setMessage("이미 사용 중인 아이디입니다. 다른 아이디를 사용하세요.");
      } else if (/invalid login credentials/i.test(messageText)) {
        setMessage("로그인에 실패했습니다. 아이디 또는 비밀번호를 확인하세요.");
      } else if (/email rate limit exceeded|rate limit exceeded|too many requests/i.test(messageText)) {
        setMessage(
          "요청이 너무 많아 잠시 제한되었습니다. 잠시 후 다시 시도하거나, 이미 가입된 계정이면 로그인으로 진행하세요."
        );
      } else if (/invalid email|email address.*invalid/i.test(messageText)) {
        setMessage("아이디를 다시 확인하고 시도하세요.");
      } else if (/password/i.test(messageText)) {
        setMessage("비밀번호는 6자 이상으로 입력하세요.");
      } else {
        console.error("Auth failed:", error);
        setMessage("인증에 실패했습니다. 아이디와 비밀번호를 다시 확인하세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const secondaryLink = getSecondaryLink(mode);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.45),_rgba(248,250,252,1)_34%,_rgba(226,232,240,0.9)_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <AppMenu compact />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 overflow-hidden rounded-[32px] border border-white/70 bg-white/80 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur lg:grid-cols-[1.05fr_0.95fr]">
          <section className="flex flex-col justify-between gap-10 bg-slate-950 px-6 py-8 text-white sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="space-y-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">
                Travel Map Diary
              </p>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {getHeading(mode)}
                </h1>
                <p className="max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  {getDescription(mode)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-slate-200 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">1</p>
                <p className="mt-2 leading-6">간단한 아이디를 만들고 바로 시작하세요.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">2</p>
                <p className="mt-2 leading-6">로그인하면 나만의 지도와 일기가 저장됩니다.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">3</p>
                <p className="mt-2 leading-6">로그인 후에는 서울 동 방문 기록과 사진을 바로 저장할 수 있습니다.</p>
              </div>
            </div>
          </section>

          <section className="flex items-center px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="w-full max-w-md space-y-6">
              {isCheckingSession ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
                  로그인 상태를 확인하는 중입니다.
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                  {getHeading(mode)}
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  개인 지도 시작
                </h2>
                <p className="text-sm leading-6 text-slate-600">내 여행 기록을 안전하게 보관하세요.</p>
              </div>

              <form className="space-y-3" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <input
                    value={authHandle}
                    onChange={(event) => setAuthHandle(event.target.value)}
                    type="text"
                    autoComplete="username"
                    placeholder="아이디"
                    minLength={3}
                    maxLength={32}
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400"
                  />
                  <p className="px-1 text-xs leading-5 text-slate-500">
                    3자 이상 32자 이하. 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.
                  </p>
                  <input
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="비밀번호"
                    minLength={6}
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400"
                  />
                  <p className="px-1 text-xs leading-5 text-slate-500">비밀번호는 6자 이상으로 입력하세요.</p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isCheckingSession}
                  className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isCheckingSession ? "확인 중" : isSubmitting ? "처리 중" : getSubmitLabel(mode)}
                </button>
              </form>

              {message ? (
                <p className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
                  {message}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                <Link href={secondaryLink.href} className="font-medium text-sky-700 hover:text-sky-800">
                  {secondaryLink.label}
                </Link>
                <Link href="/" className="font-medium text-slate-500 hover:text-slate-700">
                  지도 보기
                </Link>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAuthHandle("");
                  setAuthPassword("");
                  setMessage(null);
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                입력 초기화
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
