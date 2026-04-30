"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import AppMenu from "@/components/AppMenu";
import MapSelector from "@/components/MapSelector";
import { useTravelMaps } from "@/components/TravelMapProvider";
import type { TravelMap } from "@/lib/travelMaps";

type VisitStyle = {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
};

type SelectedDong = {
  dongCode: string;
  dongName: string;
  visitCount: number;
};

type VisitStats = {
  visitedDongCount: number;
  totalVisitCount: number;
  topDongName: string | null;
  topVisitCount: number;
};

type DongDiary = {
  id: string;
  dong_code: string;
  dong_name: string;
  title: string | null;
  content: string;
  photo_url: string | null;
  created_at: string;
};

type PolygonCoordinates = number[][][];
type MultiPolygonCoordinates = number[][][][];

type GeoJsonFeature = {
  properties: {
    EMD_CD: string;
    EMD_NM: string;
  };
  geometry:
    | {
        type: "Polygon";
        coordinates: PolygonCoordinates;
      }
    | {
        type: "MultiPolygon";
        coordinates: MultiPolygonCoordinates;
      };
};

type GeoJsonCollection = {
  features: GeoJsonFeature[];
};

type NaverPolygonInstance = {
  setOptions: (options: VisitStyle & { zIndex: number }) => void;
};

type NaverMapApi = {
  maps: {
    Map: new (
      element: HTMLDivElement,
      options: {
        center: unknown;
        zoom: number;
        disableDoubleClickZoom: boolean;
      }
    ) => unknown;
    LatLng: new (lat: number, lng: number) => unknown;
    Polygon: new (options: {
      map: unknown;
      paths: unknown[];
      clickable: boolean;
      zIndex: number;
    } & VisitStyle) => NaverPolygonInstance;
    Event: {
      addListener: (
        target: NaverPolygonInstance,
        eventName: string,
        handler: () => void
      ) => void;
    };
  };
};

type NaverWindow = Window & {
  naver?: NaverMapApi;
};

function getVisitStyle(count: number): VisitStyle {
  if (count <= 0) {
    return {
      fillColor: "#FBE4D6",
      fillOpacity: 0.08,
      strokeColor: "#261FB3",
      strokeOpacity: 0.12,
      strokeWeight: 1,
    };
  }

  const maxCountForColor = 10;
  const t = Math.min(count / maxCountForColor, 1);

  const start = { r: 38, g: 31, b: 179 }; // #261FB3
  const end = { r: 12, g: 9, b: 80 }; // #0C0950

  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);

  const color = `rgb(${r}, ${g}, ${b})`;

  return {
    fillColor: color,
    fillOpacity: 0.2 + t * 0.45,
    strokeColor: color,
    strokeOpacity: 0.25 + t * 0.45,
    strokeWeight: 1,
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NaverMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoPreviewUrlRef = useRef<string | null>(null);
  const mapInitializedRef = useRef(false);
  const mapDataLoadedRef = useRef(false);
  const polygonGroupsRef = useRef(new Map<string, NaverPolygonInstance[]>());
  const visitCountByDongRef = useRef(new Map<string, number>());
  const dongNameByCodeRef = useRef(new Map<string, string>());
  const authUserRef = useRef<User | null>(null);
  const currentMapRef = useRef<TravelMap | null>(null);
  const canEditCurrentMapRef = useRef(false);
  const clickPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { authUser, currentMap, canEditCurrentMap, isLoadingMaps } = useTravelMaps();
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);

  const [selectedDong, setSelectedDong] = useState<SelectedDong | null>(null);
  const [hoveredDongName, setHoveredDongName] = useState<string | null>(null);
  const [diaries, setDiaries] = useState<DongDiary[]>([]);
  const [isLoadingDiaries, setIsLoadingDiaries] = useState(false);
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryContent, setDiaryContent] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoLink, setPhotoLink] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [visitStats, setVisitStats] = useState<VisitStats>({
    visitedDongCount: 0,
    totalVisitCount: 0,
    topDongName: null,
    topVisitCount: 0,
  });

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  useEffect(() => {
    currentMapRef.current = currentMap;
  }, [currentMap]);

  useEffect(() => {
    canEditCurrentMapRef.current = canEditCurrentMap;
  }, [canEditCurrentMap]);

  const applyPolygonStyle = useCallback((dongCode: string, style: VisitStyle, zIndex: number) => {
    const polygonGroup = polygonGroupsRef.current.get(dongCode);

    polygonGroup?.forEach((polygon) => {
      polygon.setOptions({
        ...style,
        zIndex,
      });
    });
  }, []);

  const clearClickPulse = useCallback((dongCode: string, visitCount: number) => {
    applyPolygonStyle(dongCode, getVisitStyle(visitCount), visitCount > 0 ? 100 : 10);
  }, [applyPolygonStyle]);

  function setHoverLabel(name: string | null) {
    setHoveredDongName(name);
  }

  const resetUserScopedMapState = useCallback(() => {
    visitCountByDongRef.current.clear();
    dongNameByCodeRef.current.clear();

    polygonGroupsRef.current.forEach((_, dongCode) => {
      applyPolygonStyle(dongCode, getVisitStyle(0), 10);
    });

    setVisitStats({
      visitedDongCount: 0,
      totalVisitCount: 0,
      topDongName: null,
      topVisitCount: 0,
    });
  }, [applyPolygonStyle]);

  const syncSelectedMapState = useCallback(async (mapId: string | null) => {
    setSelectedDong(null);
    setIsModalOpen(false);
    if (photoPreviewUrlRef.current) {
      URL.revokeObjectURL(photoPreviewUrlRef.current);
      photoPreviewUrlRef.current = null;
    }
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoInputKey((current) => current + 1);
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
    setDiaryTitle("");
    setDiaryContent("");
    setPhotoLink("");

    if (!mapId) {
      resetUserScopedMapState();
      setDiaries([]);
      setHoveredDongName(null);
      return;
    }

    const visitCountMap = new Map<string, number>();
    const dongNameMap = new Map<string, string>();

    const { data: visitedPlaces, error } = await supabase
      .from("visited_places")
      .select("dong_code, dong_name, visit_count")
      .eq("map_id", mapId);

    if (error) {
      console.error("Failed to load visited places:", error);
      setStatusMessage("방문 기록을 불러오지 못했습니다.");
      return;
    }

    visitedPlaces?.forEach((place) => {
      const count = place.visit_count ?? 1;
      visitCountMap.set(place.dong_code, count);
      dongNameMap.set(place.dong_code, place.dong_name);
    });

    visitCountByDongRef.current = visitCountMap;
    dongNameByCodeRef.current = dongNameMap;

    const visitedDongCount = visitedPlaces?.length ?? 0;
    const totalVisitCount = (visitedPlaces ?? []).reduce(
      (sum, place) => sum + (place.visit_count ?? 1),
      0
    );
    const topVisitedPlace = (visitedPlaces ?? []).reduce(
      (top, place) => ((place.visit_count ?? 1) > (top?.visit_count ?? 0) ? place : top),
      visitedPlaces?.[0] ?? null
    );

    setVisitStats({
      visitedDongCount,
      totalVisitCount,
      topDongName: topVisitedPlace ? dongNameMap.get(topVisitedPlace.dong_code) ?? topVisitedPlace.dong_name : null,
      topVisitCount: topVisitedPlace?.visit_count ?? 0,
    });

    polygonGroupsRef.current.forEach((_, dongCode) => {
      const count = visitCountMap.get(dongCode) ?? 0;
      applyPolygonStyle(dongCode, getVisitStyle(count), count > 0 ? 100 : 10);
    });
  }, [applyPolygonStyle, resetUserScopedMapState]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrlRef.current);
      }

      if (clickPulseTimerRef.current) {
        clearTimeout(clickPulseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mapId = currentMap?.id ?? null;
    void Promise.resolve().then(() => syncSelectedMapState(mapId));
  }, [currentMap?.id, syncSelectedMapState]);



  useEffect(() => {
    let isActive = true;

    async function loadDiaries() {
      if (!selectedDong || !currentMap) {
        setDiaries([]);
        return;
      }

      setIsLoadingDiaries(true);
      setStatusMessage(null);

      try {
        const { data, error } = await supabase
          .from("dong_diaries")
          .select("id, dong_code, dong_name, title, content, photo_url, created_at")
          .eq("dong_code", selectedDong.dongCode)
          .eq("map_id", currentMap.id)
          .order("created_at", { ascending: false });

        if (!isActive) return;

        if (error) throw error;

        setDiaries((data ?? []) as DongDiary[]);
      } catch (err) {
        console.error("Failed to load diaries:", err);
        try {
          // Some error objects are non-enumerable; log full properties when possible
          console.error("Error details:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
        } catch {
          // ignore stringify errors
        }

        setStatusMessage("일기 목록을 불러오지 못했습니다.");
        setDiaries([]);
      } finally {
        setIsLoadingDiaries(false);
      }
    }

    void loadDiaries();

    return () => {
      isActive = false;
    };
  }, [selectedDong, currentMap]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function initializeMapWhenReady() {
      const naver = (window as NaverWindow).naver;
      if (!naver?.maps || !mapRef.current) {
        if (!cancelled) {
          timeoutId = setTimeout(initializeMapWhenReady, 100);
        }
        return;
      }

      if (mapInitializedRef.current) {
        return;
      }

      mapInitializedRef.current = true;
      const naverApi = naver;

      const map = new naverApi.maps.Map(mapRef.current, {
        center: new naverApi.maps.LatLng(37.5665, 126.978),
        zoom: 11,
        disableDoubleClickZoom: true,
      });

      async function loadMap() {
        if (mapDataLoadedRef.current) {
          return;
        }

        mapDataLoadedRef.current = true;
        polygonGroupsRef.current.clear();

        const res = await fetch("/geo/seoul-dong.json");
        const geojson = (await res.json()) as GeoJsonCollection;

        geojson.features.forEach((feature) => {
          const dongCode = feature.properties.EMD_CD;
          const dongName = feature.properties.EMD_NM;
          const visitCount = visitCountByDongRef.current.get(dongCode) ?? 0;
          const geometry = feature.geometry;

          if (geometry.type === "Polygon") {
            drawPolygon(geometry.coordinates, dongCode, dongName, visitCount);
          }

          if (geometry.type === "MultiPolygon") {
            geometry.coordinates.forEach((polygonCoords) => {
              drawPolygon(polygonCoords, dongCode, dongName, visitCount);
            });
          }
        });
      }

      function drawPolygon(
        coords: PolygonCoordinates,
        dongCode: string,
        dongName: string,
        initialVisitCount: number
      ) {
        const paths = coords[0].map(
          ([lng, lat]: number[]) => new naverApi.maps.LatLng(lat, lng)
        );

        const polygon = new naverApi.maps.Polygon({
          map,
          paths,
          clickable: true,
          zIndex: initialVisitCount > 0 ? 100 : 10,
          ...getVisitStyle(initialVisitCount),
        });

        const existingGroup = polygonGroupsRef.current.get(dongCode) ?? [];
        existingGroup.push(polygon);
        polygonGroupsRef.current.set(dongCode, existingGroup);

        naverApi.maps.Event.addListener(polygon, "mouseover", () => {
          setHoverLabel(dongName);
        });

        naverApi.maps.Event.addListener(polygon, "mouseout", () => {
          setHoverLabel(null);
        });

        naverApi.maps.Event.addListener(polygon, "click", () => {
          const currentUser = authUserRef.current;
          const selectedMap = currentMapRef.current;

          if (!currentUser) {
            setStatusMessage("로그인 후 개인 기록을 남길 수 있습니다.");
            return;
          }

          if (!selectedMap) {
            setStatusMessage("먼저 사용할 지도를 선택하거나 새 지도를 만드세요.");
            return;
          }

          const currentVisitCount = visitCountByDongRef.current.get(dongCode) ?? 0;
          setSelectedDong({ dongCode, dongName, visitCount: currentVisitCount });

          if (canEditCurrentMapRef.current) {
            setIsModalOpen(true);
          } else {
            setStatusMessage("이 지도는 읽기 전용입니다.");
          }

          const pulseStyle: VisitStyle = {
            fillColor: "#7c3aed",
            fillOpacity: 0.42,
            strokeColor: "#4c1d95",
            strokeOpacity: 0.95,
            strokeWeight: 2,
          };

          applyPolygonStyle(dongCode, pulseStyle, 200);

          if (clickPulseTimerRef.current) {
            clearTimeout(clickPulseTimerRef.current);
          }

          clickPulseTimerRef.current = setTimeout(() => {
            clearClickPulse(dongCode, currentVisitCount);
          }, 380);
        });
      }

      void loadMap();
    }

    void initializeMapWhenReady();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [applyPolygonStyle, clearClickPulse]);

  async function handleDiarySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authUser) {
      setStatusMessage("로그인 후 개인 기록을 저장할 수 있습니다.");
      return;
    }

    if (!currentMap) {
      setStatusMessage("먼저 사용할 지도를 선택하거나 새 지도를 만드세요.");
      return;
    }

    if (!canEditCurrentMap) {
      setStatusMessage("이 지도는 읽기만 가능합니다.");
      return;
    }

    if (!selectedDong) {
      setStatusMessage("먼저 지도를 클릭해서 동을 선택하세요.");
      return;
    }

    const trimmedContent = diaryContent.trim();
    if (!trimmedContent) {
      setStatusMessage("일기 내용을 입력하세요.");
      return;
    }

    setIsSavingDiary(true);
    setStatusMessage(null);

    try {
      let photoUrl = photoLink.trim() || null;

      if (photoFile) {
        const fileExtension = photoFile.name.split(".").pop() || "jpg";
        const filePath = `${currentMap.id}/${authUser.id}/${selectedDong.dongCode}/${crypto.randomUUID()}.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from("dong-diary-photos")
          .upload(filePath, photoFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from("dong-diary-photos")
          .getPublicUrl(filePath);

        photoUrl = publicUrlData.publicUrl;
      }

      const { data, error } = await supabase
        .from("dong_diaries")
        .insert({
          map_id: currentMap.id,
          user_id: authUser.id,
          dong_code: selectedDong.dongCode,
          dong_name: selectedDong.dongName,
          title: diaryTitle.trim() || null,
          content: trimmedContent,
          photo_url: photoUrl,
        })
        .select("id, dong_code, dong_name, title, content, photo_url, created_at")
        .single();

      if (error) {
        throw error;
      }

      setDiaries((current) => [data as DongDiary, ...current]);
      setDiaryTitle("");
      setDiaryContent("");
      clearPhotoSelection();
      setPhotoLink("");
      // After successful diary insert, increment visited_places.visit_count for this user only.
      try {
        const nextVisitCount = (visitCountByDongRef.current.get(selectedDong.dongCode) ?? 0) + 1;
        const { error: visitError } = await supabase.from("visited_places").upsert(
          {
            user_id: authUser.id,
            map_id: currentMap.id,
            dong_code: selectedDong!.dongCode,
            dong_name: selectedDong!.dongName,
            visit_count: nextVisitCount,
          },
          { onConflict: "map_id,dong_code" }
        );

        if (visitError) {
          console.error("Failed to update visit count:", visitError);
        } else {
          visitCountByDongRef.current.set(selectedDong!.dongCode, nextVisitCount);
          dongNameByCodeRef.current.set(selectedDong!.dongCode, selectedDong!.dongName);
          setSelectedDong({
            dongCode: selectedDong!.dongCode,
            dongName: selectedDong!.dongName,
            visitCount: nextVisitCount,
          });
          applyPolygonStyle(
            selectedDong!.dongCode,
            getVisitStyle(nextVisitCount),
            nextVisitCount > 0 ? 100 : 10
          );
          setVisitStats(() => {
            const nextVisitedDongCount = visitCountByDongRef.current.size;
            const nextTotalVisitCount = Array.from(visitCountByDongRef.current.values()).reduce(
              (sum, value) => sum + value,
              0
            );

            let topDongCode: string | null = null;
            let nextTopVisitCount = 0;

            visitCountByDongRef.current.forEach((count, dongCode) => {
              if (count > nextTopVisitCount) {
                nextTopVisitCount = count;
                topDongCode = dongCode;
              }
            });

            return {
              visitedDongCount: nextVisitedDongCount,
              totalVisitCount: nextTotalVisitCount,
              topDongName: topDongCode ? dongNameByCodeRef.current.get(topDongCode) ?? null : null,
              topVisitCount: nextTopVisitCount,
            };
          });
        }
      } catch (e) {
        console.error("Error updating visit count:", e);
      }

      setStatusMessage("동 일기와 사진이 저장되었습니다.");

      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to save diary:", error);
      setStatusMessage("일기 저장에 실패했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setIsSavingDiary(false);
    }
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    if (photoPreviewUrlRef.current) {
      URL.revokeObjectURL(photoPreviewUrlRef.current);
      photoPreviewUrlRef.current = null;
    }

    setPhotoFile(nextFile);

    if (!nextFile) {
      setPhotoPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(nextFile);
    photoPreviewUrlRef.current = nextPreviewUrl;
    setPhotoPreviewUrl(nextPreviewUrl);
  }

  function clearPhotoSelection() {
    if (photoPreviewUrlRef.current) {
      URL.revokeObjectURL(photoPreviewUrlRef.current);
      photoPreviewUrlRef.current = null;
    }

    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoInputKey((current) => current + 1);

    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }

  function closeModal() {
    setIsModalOpen(false);
    clearPhotoSelection();
    setDiaryTitle("");
    setDiaryContent("");
    setPhotoLink("");
  }

  async function handleLogout() {
    setIsAuthSubmitting(true);
    setAuthMessage(null);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setAuthMessage("로그아웃되었습니다.");
    } catch (error) {
      console.error("Logout failed:", error);
      setAuthMessage("로그아웃에 실패했습니다.");
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  const visitBadgeItems = [
    {
      label: "방문한 동",
      value: `${visitStats.visitedDongCount}개`,
      toneClassName: "border-sky-200 bg-sky-50 text-sky-700",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />
        </svg>
      ),
    },
    {
      label: "총 방문",
      value: `${visitStats.totalVisitCount}회`,
      toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M12 3 4 7v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V7l-8-4Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v7Z" />
        </svg>
      ),
    },
    {
      label: "가장 많이 간 동",
      value: visitStats.topDongName ? `${visitStats.topDongName} · ${visitStats.topVisitCount}회` : "없음",
      toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M12 2 9 8l-6 .9 4.4 4.3-1 6 5.6-2.9 5.6 2.9-1-6L21 8.9 15 8l-3-6Z" />
        </svg>
      ),
    },
  ];

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(237,246,255,0.95),_rgba(247,250,252,1)_34%,_rgba(232,238,252,0.92)_100%)] text-slate-900">
      <AppMenu />
      {isModalOpen && selectedDong ? (
        <div className="fixed left-0 top-0 z-50 flex h-full w-full items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{selectedDong.dongName}에 일기 추가</h3>
              <button
                onClick={closeModal}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
              >
                닫기
              </button>
            </div>
            <form className="mt-4 space-y-3" onSubmit={handleDiarySubmit}>
              <input
                value={diaryTitle}
                onChange={(e) => setDiaryTitle(e.target.value)}
                placeholder="제목"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-sky-500"
              />
              <textarea
                value={diaryContent}
                onChange={(e) => setDiaryContent(e.target.value)}
                placeholder="이 동에서 어떤 하루를 보냈는지 적어보세요."
                rows={6}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-sky-500"
              />
              <input
                value={photoLink}
                onChange={(event) => setPhotoLink(event.target.value)}
                placeholder="사진 URL을 직접 붙여 넣을 수도 있습니다."
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-sky-500"
              />
              <input
                key={photoInputKey}
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="block w-full cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-800"
              />

              {photoPreviewUrl ? (
                <div className="relative h-44 overflow-hidden rounded-2xl border border-slate-200 bg-black/5">
                  <Image src={photoPreviewUrl} alt="선택한 사진 미리보기" fill unoptimized className="object-cover" />
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full border px-4 py-2 text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSavingDiary}
                  className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                >
                  {isSavingDiary ? "저장 중" : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <div className="mx-auto grid min-h-dvh w-full max-w-[1600px] gap-4 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-20 sm:p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
        <section className="flex min-h-[56vh] flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white/80 shadow-[0_30px_80px_rgba(15,23,42,0.14)] backdrop-blur sm:min-h-[60vh] lg:h-[calc(100vh-2rem)] lg:min-h-0 lg:rounded-[28px]">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-700 sm:text-xs sm:tracking-[0.28em]">
                Travel Map Diary
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                {currentMap ? currentMap.title : "서울 동 단위 여행 일기"}
              </h1>
            </div>
            <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center xl:justify-end">
              <div className="inline-flex w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 shadow-sm sm:w-fit sm:px-3 sm:text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm sm:h-6 sm:w-6">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                    <path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />
                  </svg>
                </span>
                <span>방문 횟수 + 일기 + 사진</span>
              </div>

              <div
                data-testid="visit-stats"
                className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap"
              >
                {visitBadgeItems.map((item) => (
                  <div
                    key={item.label}
                    className={`flex min-w-0 items-center gap-2.5 rounded-2xl border px-3 py-2 shadow-sm xl:min-w-[185px] ${item.toneClassName}`}
                  >
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/80 shadow-sm sm:h-9 sm:w-9">
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80 sm:text-[11px] sm:tracking-[0.18em]">
                        {item.label}
                      </p>
                      <p className="truncate text-[13px] font-semibold text-slate-950 sm:text-sm">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="relative h-[60vh] min-h-[420px] max-h-[640px] overflow-hidden sm:min-h-[54vh] lg:h-auto lg:min-h-0 lg:max-h-none lg:flex-1">
            <div ref={mapRef} className="h-full w-full" />
            <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 sm:left-4 sm:top-4 sm:max-w-[360px]">
              <div className="hidden rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm font-medium text-slate-800 shadow-lg backdrop-blur sm:block">
                {hoveredDongName ? `현재 보기: ${hoveredDongName}` : "동 위에 마우스를 올리면 이름이 표시됩니다."}
              </div>

              {statusMessage ? (
                <div className="rounded-2xl border border-sky-200 bg-white/90 px-4 py-3 text-sm text-slate-700 shadow-lg backdrop-blur">
                  {statusMessage}
                </div>
              ) : null}
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] sm:bottom-4 sm:left-4">
              <div className="rounded-2xl border border-white/70 bg-white/90 p-2 shadow-lg backdrop-blur sm:p-4">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:mb-2 sm:text-[11px] sm:tracking-[0.24em]">
                  Legend
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                    <span className="h-2 w-2 rounded-full border border-slate-300 bg-[#FBE4D6]" />
                    방문 전
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                    <span className="h-2 w-2 rounded-full border border-[#261FB3] bg-[#261FB3]" />
                    1회 이상 방문
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                    <span className="h-2 w-2 rounded-full border border-emerald-400 bg-emerald-400" />
                    통계 상위 동
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                    <span className="h-2 w-2 rounded-full border border-violet-500 bg-violet-500" />
                    선택한 동
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        <aside
          data-testid="mobile-side-panel"
          className="flex min-h-0 flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-slate-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 text-slate-100 shadow-[0_30px_80px_rgba(15,23,42,0.2)] sm:pb-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
        >
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 sm:p-5">
            {!authUser ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">로그인 필요</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    아이디로 시작하기
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    로그인하면 방문 기록과 일기를 내 계정에 저장할 수 있습니다.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/login"
                    className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                  >
                    로그인
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    회원가입
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                    로그인됨
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    {authUser.email ? authUser.email.split("@")[0] : "익명 계정"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {isLoadingMaps ? "지도 목록을 불러오는 중입니다." : "내 여행 기록을 불러왔습니다."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isAuthSubmitting}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-white/10"
                >
                  로그아웃
                </button>
              </div>
            )}

            {authMessage ? (
              <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
                {authMessage}
              </p>
            ) : null}
          </div>

          <MapSelector />

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setIsTimelineOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left lg:cursor-default"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                  동별 기록
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  타임라인
                </h2>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-slate-200 lg:hidden">
                {isTimelineOpen ? "접기" : "펼치기"}
              </span>
            </button>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-[15px]">
              지도를 클릭해 동을 선택하고, 저장된 기록을 아래에서 확인하세요.
            </p>
          </div>

          <div
            className={`min-h-0 flex-1 overflow-hidden rounded-[24px] border border-white/10 bg-white/5 p-4 sm:p-5 ${
              isTimelineOpen ? "block" : "hidden lg:block"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                  저장된 기록
                </p>
                <h3 className="mt-2 text-base font-semibold text-white sm:text-lg">동별 타임라인</h3>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                {isLoadingDiaries ? "불러오는 중" : `${diaries.length}개`}
              </span>
            </div>

            <div className="mt-4 max-h-[30vh] space-y-3 overflow-y-auto pr-1 sm:max-h-[34vh] lg:max-h-[calc(100vh-560px)]">
              {!selectedDong ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-slate-300">
                  동을 먼저 선택하면 이곳에 일기와 사진이 쌓입니다.
                </div>
              ) : isLoadingDiaries ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-slate-300">
                  일기를 불러오는 중입니다.
                </div>
              ) : diaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-slate-300">
                  아직 작성된 일기가 없습니다. 첫 기록을 남겨보세요.
                </div>
              ) : (
                diaries.map((diary) => (
                  <article
                    key={diary.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                  >
                    {diary.photo_url ? (
                      <div className="relative h-40 w-full">
                        <Image
                          src={diary.photo_url}
                          alt={diary.title ?? diary.dong_name}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-white">
                            {diary.title ?? diary.dong_name}
                          </h4>
                          <p className="mt-1 text-xs text-slate-400">
                            {formatDateTime(diary.created_at)}
                          </p>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                        {diary.content}
                      </p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
