"use client";

import { useState } from "react";

type MapCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, description?: string) => Promise<void>;
};

export default function MapCreateModal({ isOpen, onClose, onCreate }: MapCreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setMessage("지도 이름을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      await onCreate(title.trim(), description.trim());
      setTitle("");
      setDescription("");
      onClose();
    } catch (error) {
      console.error("Failed to create map:", error);
      setMessage("지도를 만들지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              새 지도
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">지도 만들기</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
          >
            닫기
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="지도 이름"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="설명"
            rows={3}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400"
          />

          {message ? (
            <p className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving ? "만드는 중" : "지도 만들기"}
          </button>
        </form>
      </div>
    </div>
  );
}
