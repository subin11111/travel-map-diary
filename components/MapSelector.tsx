"use client";

import { useState } from "react";
import MapCreateModal from "@/components/MapCreateModal";
import MapShareModal from "@/components/MapShareModal";
import { useTravelMaps } from "@/components/TravelMapProvider";

export default function MapSelector() {
  const {
    authUser,
    maps,
    currentMap,
    isLoadingMaps,
    mapError,
    canEditCurrentMap,
    selectMap,
    createMap,
  } = useTravelMaps();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  if (!authUser) {
    return null;
  }

  const ownedMaps = maps.filter((map) => map.role === "owner");
  const sharedMaps = maps.filter((map) => map.role !== "owner");

  return (
    <>
      <section className="rounded-[24px] border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
              지도 선택
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {currentMap?.title ?? (isLoadingMaps ? "지도 불러오는 중" : "지도가 없습니다")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {currentMap
                ? currentMap.role === "owner"
                  ? "내가 만든 지도입니다."
                  : currentMap.role === "editor"
                    ? "편집 권한이 있는 공유 지도입니다."
                    : "읽기 권한이 있는 공유 지도입니다."
                : isLoadingMaps
                  ? "사용할 지도를 확인하고 있습니다."
                  : "아직 생성된 지도가 없습니다. 새 지도를 만들어 주세요."}
            </p>
          </div>
        </div>

        {mapError ? (
          <p className="mt-3 rounded-2xl border border-sky-300/30 bg-sky-950/40 px-4 py-3 text-sm font-medium text-slate-100">
            {mapError}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {maps.length > 0 ? (
            <select
              value={currentMap?.id ?? ""}
              onChange={(event) => selectMap(event.target.value)}
              disabled={isLoadingMaps}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none focus:border-sky-300 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {ownedMaps.length > 0 ? (
                <optgroup label="내 지도">
                  {ownedMaps.map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {sharedMaps.length > 0 ? (
                <optgroup label="공유 받은 지도">
                  {sharedMaps.map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          ) : (
            <div className="rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-slate-200">
              새 지도를 만들면 방문 기록과 일기를 저장할 수 있습니다.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              새 지도 만들기
            </button>
            {currentMap?.role === "owner" ? (
              <button
                type="button"
                onClick={() => setIsShareOpen(true)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                공유 관리
              </button>
            ) : null}
          </div>

          {!canEditCurrentMap && currentMap ? (
            <p className="text-xs leading-5 text-slate-300">
              이 지도에서는 기록을 볼 수만 있습니다.
            </p>
          ) : null}
        </div>
      </section>

      <MapCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={async (title, description) => {
          return createMap(title, description);
        }}
      />
      <MapShareModal
        isOpen={isShareOpen}
        map={currentMap}
        onClose={() => setIsShareOpen(false)}
      />
    </>
  );
}
