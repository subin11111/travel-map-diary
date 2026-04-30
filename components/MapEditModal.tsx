"use client";

import { useState } from "react";
import type { TravelMap } from "@/lib/travelMaps";

type MapEditModalProps = {
  isOpen: boolean;
  map: TravelMap | null;
  onClose: () => void;
  onSave: (
    mapId: string,
    input: { title: string; description?: string | null; icon?: string | null }
  ) => Promise<{ ok: true } | { ok: false; errorMessage: string }>;
};

export default function MapEditModal({ isOpen, map, onClose, onSave }: MapEditModalProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || !map) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!map) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "");
    const description = String(formData.get("description") ?? "");
    const icon = String(formData.get("icon") ?? "");

    if (!title.trim()) {
      setMessage("지도 이름을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const result = await onSave(map.id, {
      title,
      description,
      icon,
    });

    if (result.ok) {
      onClose();
    } else {
      setMessage(result.errorMessage);
    }

    setIsSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Map settings
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">지도 정보 수정</h2>
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
            name="icon"
            defaultValue={map.icon ?? ""}
            placeholder="아이콘 또는 이모지"
            maxLength={8}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-sky-500"
          />
          <input
            name="title"
            defaultValue={map.title}
            placeholder="지도 이름"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-sky-500"
          />
          <textarea
            name="description"
            defaultValue={map.description ?? ""}
            placeholder="지도 설명"
            rows={4}
            className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-sky-500"
          />

          {message ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving ? "저장 중" : "저장"}
          </button>
        </form>
      </div>
    </div>
  );
}
