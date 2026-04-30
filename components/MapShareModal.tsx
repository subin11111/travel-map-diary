"use client";

import { useEffect, useState } from "react";
import {
  fetchMapMembers,
  removeMapMember,
  shareTravelMap,
  type MapMember,
  type MapRole,
  type TravelMap,
} from "@/lib/travelMaps";

type ShareRole = Exclude<MapRole, "owner">;

type MapShareModalProps = {
  isOpen: boolean;
  map: TravelMap | null;
  onClose: () => void;
};

export default function MapShareModal({ isOpen, map, onClose }: MapShareModalProps) {
  const [members, setMembers] = useState<MapMember[]>([]);
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      if (!isOpen || !map) {
        return;
      }

      setIsLoading(true);
      setMessage(null);

      try {
        const nextMembers = await fetchMapMembers(map.id);

        if (!cancelled) {
          setMembers(nextMembers);
        }
      } catch (error) {
        console.error("Failed to load map members:", error);

        if (!cancelled) {
          setMessage("공유 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [isOpen, map]);

  if (!isOpen || !map) {
    return null;
  }

  async function reloadMembers() {
    if (!map) {
      return;
    }

    setMembers(await fetchMapMembers(map.id));
  }

  async function handleShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedMap = map;
    if (!selectedMap) {
      return;
    }

    if (!handle.trim()) {
      setMessage("공유할 아이디를 입력하세요.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      await shareTravelMap(selectedMap.id, handle, role);
      setHandle("");
      await reloadMembers();
      setMessage("공유 설정이 저장되었습니다.");
    } catch (error) {
      console.error("Failed to share map:", error);
      setMessage(error instanceof Error ? error.message : "공유 설정에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(member: MapMember) {
    setIsSaving(true);
    setMessage(null);

    try {
      await removeMapMember(member);
      await reloadMembers();
    } catch (error) {
      console.error("Failed to remove member:", error);
      setMessage(error instanceof Error ? error.message : "공유 해제에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              공유 관리
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{map.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
          >
            닫기
          </button>
        </div>

        <form className="mt-5 grid gap-2 sm:grid-cols-[1fr_120px_auto]" onSubmit={handleShare}>
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="공유할 아이디"
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-sky-500"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as ShareRole)}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 outline-none focus:border-sky-500"
          >
            <option value="viewer">읽기</option>
            <option value="editor">편집</option>
          </select>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            공유
          </button>
        </form>

        {message ? (
          <p className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-slate-800">
            {message}
          </p>
        ) : null}

        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            공유된 사용자
          </p>
          {isLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              불러오는 중입니다.
            </div>
          ) : members.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              아직 공유된 사용자가 없습니다.
            </div>
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{member.handle}</p>
                  <p className="text-xs text-slate-500">
                    {member.role === "owner"
                      ? "소유자"
                      : member.role === "editor"
                        ? "편집 가능"
                        : "읽기 가능"}
                  </p>
                </div>
                {member.role !== "owner" ? (
                  <button
                    type="button"
                    onClick={() => handleRemove(member)}
                    disabled={isSaving}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    해제
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
