"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

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

  const [selectedDong, setSelectedDong] = useState<SelectedDong | null>(null);
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

  useEffect(() => {
    return () => {
      if (photoPreviewUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadDiaries() {
      if (!selectedDong) {
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
          .order("created_at", { ascending: false });

        if (!isActive) return;

        if (error) throw error;

        setDiaries((data ?? []) as DongDiary[]);
      } catch (err) {
        console.error("Failed to load diaries:", err);
        try {
          // Some error objects are non-enumerable; log full properties when possible
          console.error("Error details:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
        } catch (e) {
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
  }, [selectedDong]);

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
        const visitCountMap = new Map<string, number>();

        const { data: visitedPlaces, error } = await supabase
          .from("visited_places")
          .select("dong_code, visit_count");

        if (error) {
          console.error("Failed to load visited places:", error);
        } else {
          visitedPlaces?.forEach((place) => {
            visitCountMap.set(place.dong_code, place.visit_count ?? 1);
          });
        }

        const res = await fetch("/geo/seoul-dong.json");
        const geojson = (await res.json()) as GeoJsonCollection;

        geojson.features.forEach((feature) => {
          const dongCode = feature.properties.EMD_CD;
          const dongName = feature.properties.EMD_NM;
          const visitCount = visitCountMap.get(dongCode) ?? 0;
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
        let currentVisitCount = initialVisitCount;

        const paths = coords[0].map(
          ([lng, lat]: number[]) => new naverApi.maps.LatLng(lat, lng)
        );

        const polygon = new naverApi.maps.Polygon({
          map,
          paths,
          clickable: true,
          zIndex: currentVisitCount > 0 ? 100 : 10,
          ...getVisitStyle(currentVisitCount),
        });

        naverApi.maps.Event.addListener(polygon, "click", async () => {
          const nextVisitCount = currentVisitCount + 1;

          const { error } = await supabase.from("visited_places").upsert(
            {
              dong_code: dongCode,
              dong_name: dongName,
              visit_count: nextVisitCount,
            },
            {
              onConflict: "dong_code",
            }
          );

          if (error) {
            console.error("Save failed:", error);
            alert("저장 실패: 콘솔을 확인하세요.");
            return;
          }

          currentVisitCount = nextVisitCount;
          setSelectedDong({ dongCode, dongName, visitCount: nextVisitCount });
          setStatusMessage(`${dongName} 방문 횟수를 ${currentVisitCount}회로 저장했습니다.`);

          polygon.setOptions({
            ...getVisitStyle(currentVisitCount),
            zIndex: 100,
          });
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
  }, []);

  async function handleDiarySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
        const filePath = `${selectedDong.dongCode}/${crypto.randomUUID()}.${fileExtension}`;

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
      setStatusMessage("동 일기와 사진이 저장되었습니다.");
    } catch (error) {
      console.error("Failed to save diary:", error);
      setStatusMessage("일기 저장에 실패했습니다. 콘솔을 확인하세요.");
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(237,246,255,0.95),_rgba(247,250,252,1)_34%,_rgba(232,238,252,0.92)_100%)] text-slate-900">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_30px_80px_rgba(15,23,42,0.14)] backdrop-blur lg:h-[calc(100vh-2rem)] lg:min-h-0">
          <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                Travel Map Diary
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                서울 동 단위 여행 일기
              </h1>
            </div>
            <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">
              방문 횟수 + 일기 + 사진
            </div>
          </div>
          <div className="relative min-h-[420px] flex-1 overflow-hidden lg:min-h-0">
            <div ref={mapRef} className="h-full w-full min-h-[420px]" />
            {statusMessage ? (
              <div className="absolute left-4 top-4 max-w-[320px] rounded-2xl border border-sky-200 bg-white/90 px-4 py-3 text-sm text-slate-700 shadow-lg backdrop-blur">
                {statusMessage}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-slate-950 px-4 py-4 text-slate-100 shadow-[0_30px_80px_rgba(15,23,42,0.2)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
              현재 선택된 동
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {selectedDong ? selectedDong.dongName : "지도를 클릭해 동을 선택하세요"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              선택한 동은 방문 횟수에 따라 색이 진해지고, 아래 폼에서 일기와 사진을 함께 저장할 수 있습니다.
            </p>

            {selectedDong ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-slate-400">동 코드</p>
                  <p className="mt-1 font-semibold text-white">{selectedDong.dongCode}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-slate-400">방문 횟수</p>
                  <p className="mt-1 font-semibold text-white">{selectedDong.visitCount}회</p>
                </div>
              </div>
            ) : null}
          </div>

          <form
            className="rounded-[24px] border border-white/10 bg-white/5 p-5"
            onSubmit={handleDiarySubmit}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                  동 일기 작성
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">오늘의 기록 추가</h3>
              </div>
              <button
                type="submit"
                disabled={!selectedDong || isSavingDiary}
                className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {isSavingDiary ? "저장 중" : "저장"}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={diaryTitle}
                onChange={(event) => setDiaryTitle(event.target.value)}
                disabled={!selectedDong}
                placeholder="제목"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300"
              />
              <textarea
                value={diaryContent}
                onChange={(event) => setDiaryContent(event.target.value)}
                disabled={!selectedDong}
                placeholder="이 동에서 어떤 하루를 보냈는지 적어보세요."
                rows={7}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-sky-300"
              />
              <input
                value={photoLink}
                onChange={(event) => setPhotoLink(event.target.value)}
                disabled={!selectedDong}
                placeholder="사진 URL을 직접 붙여 넣을 수도 있습니다."
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300"
              />
              <input
                key={photoInputKey}
                ref={photoInputRef}
                type="file"
                accept="image/*"
                disabled={!selectedDong}
                onChange={handlePhotoChange}
                className="block w-full cursor-pointer rounded-2xl border border-dashed border-white/15 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-sky-400 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-sky-300"
              />

              {photoPreviewUrl ? (
                <div className="relative h-44 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <Image
                    src={photoPreviewUrl}
                    alt="선택한 사진 미리보기"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              ) : null}
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                  저장된 기록
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">동별 타임라인</h3>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                {isLoadingDiaries ? "불러오는 중" : `${diaries.length}개`}
              </span>
            </div>

            <div className="mt-4 max-h-[38vh] space-y-3 overflow-y-auto pr-1 lg:max-h-[calc(100vh-560px)]">
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