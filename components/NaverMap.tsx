"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import MapCreateModal from "@/components/MapCreateModal";
import MapEditModal from "@/components/MapEditModal";
import MapShareModal from "@/components/MapShareModal";
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

type DrawerTab = "map" | "settings" | "stats" | "status" | "records" | "account";
type TimelineSort = "entry-desc" | "entry-asc" | "created-desc";

type DongDiary = {
  id: string;
  dong_code: string;
  dong_name: string;
  title: string | null;
  content: string;
  photo_url: string | null;
  entry_date: string | null;
  created_at: string;
};

type PolygonCoordinates = number[][][];
type MultiPolygonCoordinates = number[][][][];

type GeoJsonFeature = {
  properties: {
    emd_code?: string;
    emd_name?: string;
    EMD_CD?: string;
    EMD_NM?: string;
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

type NaverMapInstance = {
  fitBounds: (bounds: unknown) => void;
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
    ) => NaverMapInstance;
    LatLng: new (lat: number, lng: number) => unknown;
    LatLngBounds: new (sw: unknown, ne: unknown) => unknown;
    Polygon: new (options: {
      map: unknown;
      paths: unknown[] | unknown[][];
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

const EUPMYEONDONG_GEOJSON_PATH = "/geo/eupmyeondong.geojson";
const INITIAL_RENDER_EMD_PREFIX = "11";
const DEBUG_FIT_BOUNDS_TO_BOUNDARY = process.env.NODE_ENV !== "production";

type BoundaryBounds = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

function createEmptyBoundaryBounds(): BoundaryBounds {
  return {
    minLng: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };
}

function extendBoundaryBounds(bounds: BoundaryBounds, lng: number, lat: number) {
  bounds.minLng = Math.min(bounds.minLng, lng);
  bounds.maxLng = Math.max(bounds.maxLng, lng);
  bounds.minLat = Math.min(bounds.minLat, lat);
  bounds.maxLat = Math.max(bounds.maxLat, lat);
}

function getFirstGeoJsonCoordinate(feature: GeoJsonFeature) {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates[0]?.[0] ?? null;
  }

  return feature.geometry.coordinates[0]?.[0]?.[0] ?? null;
}

function getDongColorByVisitCount(visitCount: number) {
  if (visitCount <= 0) {
    return {
      fillColor: "#E5E7EB",
      strokeColor: "#9CA3AF",
      fillOpacity: 0.22,
    };
  }

  return { fillColor: "#22C55E", strokeColor: "#15803D", fillOpacity: 0.42 };
}

function getVisitStyle(count: number): VisitStyle {
  const color = getDongColorByVisitCount(count);

  return {
    ...color,
    strokeOpacity: count > 0 ? 0.76 : 0.35,
    strokeWeight: 1,
  };
}

function getTopStatDongStyle(): VisitStyle {
  return {
    fillColor: "#F59E0B",
    fillOpacity: 0.5,
    strokeColor: "#B45309",
    strokeOpacity: 0.95,
    strokeWeight: 2,
  };
}

function getHoverVisitStyle(count: number): VisitStyle {
  const baseStyle = getVisitStyle(count);

  return {
    ...baseStyle,
    fillOpacity: Math.min(baseStyle.fillOpacity + 0.2, 0.78),
    strokeWeight: Math.max(baseStyle.strokeWeight, 2),
  };
}

function getSelectedDongStyle(): VisitStyle {
  return {
    fillColor: "#BDE8F5",
    fillOpacity: 0.65,
    strokeColor: "#0F2854",
    strokeOpacity: 1,
    strokeWeight: 3,
  };
}

function getGeoJsonDongProperties(feature: GeoJsonFeature) {
  const dongCode = feature.properties.emd_code ?? feature.properties.EMD_CD;
  const dongName = feature.properties.emd_name ?? feature.properties.EMD_NM;

  if (!dongCode || !dongName) {
    return null;
  }

  return { dongCode, dongName };
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

function getTodayDateValue() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function getDiaryEntryDate(diary: DongDiary) {
  return diary.entry_date ?? diary.created_at.slice(0, 10);
}

function formatEntryDate(entryDate: string | null, createdAt: string) {
  const dateValue = entryDate ?? createdAt.slice(0, 10);

  return new Date(`${dateValue}T00:00:00`).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function sortDiaries(diaries: DongDiary[], sort: TimelineSort) {
  return [...diaries].sort((a, b) => {
    if (sort === "created-desc") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }

    const entryDateCompare = getDiaryEntryDate(a).localeCompare(getDiaryEntryDate(b));

    if (entryDateCompare !== 0) {
      return sort === "entry-asc" ? entryDateCompare : -entryDateCompare;
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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
  const topStatDongCodesRef = useRef(new Set<string>());
  const selectedDongCodeRef = useRef<string | null>(null);
  const authUserRef = useRef<User | null>(null);
  const currentMapRef = useRef<TravelMap | null>(null);
  const canEditCurrentMapRef = useRef(false);
  const clickPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    authUser,
    maps,
    currentMap,
    canEditCurrentMap,
    isLoadingMaps,
    mapError,
    selectMap,
    createMap,
    updateMap,
    deleteMap,
  } = useTravelMaps();
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>("map");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [isDeletingMap, setIsDeletingMap] = useState(false);

  const [selectedDong, setSelectedDong] = useState<SelectedDong | null>(null);
  const [isDongPanelOpen, setIsDongPanelOpen] = useState(false);
  const [hoveredDongName, setHoveredDongName] = useState<string | null>(null);
  const [diaries, setDiaries] = useState<DongDiary[]>([]);
  const [allDiaries, setAllDiaries] = useState<DongDiary[]>([]);
  const [isLoadingDiaries, setIsLoadingDiaries] = useState(false);
  const [isLoadingAllDiaries, setIsLoadingAllDiaries] = useState(false);
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryContent, setDiaryContent] = useState("");
  const [diaryEntryDate, setDiaryEntryDate] = useState(() => getTodayDateValue());
  const [timelineSort, setTimelineSort] = useState<TimelineSort>("entry-desc");
  const [recordSearch, setRecordSearch] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoLink, setPhotoLink] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [totalDongCount, setTotalDongCount] = useState(0);
  const [visitStats, setVisitStats] = useState<VisitStats>({
    visitedDongCount: 0,
    totalVisitCount: 0,
    topDongName: null,
    topVisitCount: 0,
  });

  const sortedDiaries = useMemo(() => sortDiaries(diaries, timelineSort), [diaries, timelineSort]);
  const selectedDongVisitCount = selectedDong ? Math.max(selectedDong.visitCount, diaries.length) : 0;
  const sortedAllDiaries = useMemo(() => {
    const query = recordSearch.trim().toLowerCase();
    const source = query
      ? allDiaries.filter((diary) => diary.dong_name.toLowerCase().includes(query))
      : allDiaries;

    return sortDiaries(source, timelineSort);
  }, [allDiaries, recordSearch, timelineSort]);

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

  const restyleDong = useCallback((dongCode: string) => {
    const count = visitCountByDongRef.current.get(dongCode) ?? 0;
    const isSelected = selectedDongCodeRef.current === dongCode;
    const isTopStat = topStatDongCodesRef.current.has(dongCode);

    applyPolygonStyle(
      dongCode,
      isSelected ? getSelectedDongStyle() : isTopStat ? getTopStatDongStyle() : getVisitStyle(count),
      isSelected ? 300 : isTopStat ? 180 : count > 0 ? 100 : 10
    );
  }, [applyPolygonStyle]);

  const clearClickPulse = useCallback((dongCode: string) => {
    restyleDong(dongCode);
  }, [restyleDong]);

  function setHoverLabel(name: string | null) {
    setHoveredDongName(name);
  }

  const resetUserScopedMapState = useCallback(() => {
    visitCountByDongRef.current.clear();
    dongNameByCodeRef.current.clear();
    topStatDongCodesRef.current.clear();
    selectedDongCodeRef.current = null;

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
    selectedDongCodeRef.current = null;
    setIsDongPanelOpen(false);
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
    setDiaryEntryDate(getTodayDateValue());
    setPhotoLink("");

    if (!mapId) {
      resetUserScopedMapState();
      setDiaries([]);
      setAllDiaries([]);
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

    const { data: diaryCountRows, error: diaryCountError } = await supabase
      .from("dong_diaries")
      .select("dong_code, dong_name")
      .eq("map_id", mapId);

    if (diaryCountError) {
      console.error("Failed to load diary counts:", diaryCountError);
      setStatusMessage("일기 기반 방문 횟수를 불러오지 못했습니다.");
    }

    const diaryCountByDong = new Map<string, number>();
    const diaryNameByDong = new Map<string, string>();

    diaryCountRows?.forEach((diary) => {
      diaryCountByDong.set(diary.dong_code, (diaryCountByDong.get(diary.dong_code) ?? 0) + 1);
      diaryNameByDong.set(diary.dong_code, diary.dong_name);
    });

    diaryCountByDong.forEach((diaryCount, dongCode) => {
      const currentVisitCount = visitCountMap.get(dongCode) ?? 0;

      if (diaryCount > currentVisitCount) {
        visitCountMap.set(dongCode, diaryCount);
      }

      if (!dongNameMap.has(dongCode)) {
        dongNameMap.set(dongCode, diaryNameByDong.get(dongCode) ?? dongCode);
      }
    });

    visitCountByDongRef.current = visitCountMap;
    dongNameByCodeRef.current = dongNameMap;
    const visitEntries = [...visitCountMap.entries()];
    const visitedDongCount = visitEntries.filter(([, count]) => count > 0).length;
    const totalVisitCount = visitEntries.reduce((sum, [, count]) => sum + count, 0);
    const topVisitEntry = visitEntries.reduce<[string, number] | null>(
      (top, entry) => (entry[1] > (top?.[1] ?? 0) ? entry : top),
      null
    );
    const topVisitCount = topVisitEntry?.[1] ?? 0;

    topStatDongCodesRef.current =
      topVisitCount > 0
        ? new Set(
            visitEntries
              .filter(([, count]) => count === topVisitCount)
              .map(([dongCode]) => dongCode)
          )
        : new Set<string>();

    setVisitStats({
      visitedDongCount,
      totalVisitCount,
      topDongName: topVisitEntry ? dongNameMap.get(topVisitEntry[0]) ?? null : null,
      topVisitCount,
    });

    polygonGroupsRef.current.forEach((_, dongCode) => {
      restyleDong(dongCode);
    });
  }, [resetUserScopedMapState, restyleDong]);

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

    async function loadAllDiaries() {
      if (!currentMap) {
        setAllDiaries([]);
        return;
      }

      setIsLoadingAllDiaries(true);

      try {
        const { data, error } = await supabase
          .from("dong_diaries")
          .select("id, dong_code, dong_name, title, content, photo_url, entry_date, created_at")
          .eq("map_id", currentMap.id)
          .order("entry_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });

        if (!isActive) return;

        if (error) throw error;

        setAllDiaries((data ?? []) as DongDiary[]);
      } catch (error) {
        console.error("Failed to load all diaries:", error);

        if (isActive) {
          setAllDiaries([]);
          setStatusMessage("전체 기록을 불러오지 못했습니다.");
        }
      } finally {
        if (isActive) {
          setIsLoadingAllDiaries(false);
        }
      }
    }

    void loadAllDiaries();

    return () => {
      isActive = false;
    };
  }, [currentMap]);



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
          .select("id, dong_code, dong_name, title, content, photo_url, entry_date, created_at")
          .eq("dong_code", selectedDong.dongCode)
          .eq("map_id", currentMap.id)
          .order("entry_date", { ascending: false, nullsFirst: false })
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

      if (!naverApi.maps.LatLng || !naverApi.maps.Polygon) {
        console.warn("Naver Maps API is not ready for polygon rendering.", {
          hasLatLng: Boolean(naverApi.maps.LatLng),
          hasPolygon: Boolean(naverApi.maps.Polygon),
        });
        setStatusMessage("네이버 지도 API가 아직 준비되지 않아 경계를 표시하지 못했습니다.");
        mapInitializedRef.current = false;
        if (!cancelled) {
          timeoutId = setTimeout(initializeMapWhenReady, 500);
        }
        return;
      }

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

        try {
          const res = await fetch(EUPMYEONDONG_GEOJSON_PATH);

          if (!res.ok) {
            const message = `${EUPMYEONDONG_GEOJSON_PATH} 파일을 불러오지 못했습니다. public/geo/eupmyeondong.geojson 파일이 있는지 확인하세요.`;
            console.warn("GeoJSON fetch failed.", {
              path: EUPMYEONDONG_GEOJSON_PATH,
              status: res.status,
              statusText: res.statusText,
            });
            setStatusMessage(message);
            return;
          }

          const geojson = (await res.json()) as GeoJsonCollection;
          const seoulFeatures = geojson.features.filter((feature) => {
            const properties = getGeoJsonDongProperties(feature);

            return properties?.dongCode.startsWith(INITIAL_RENDER_EMD_PREFIX);
          });

          setTotalDongCount(seoulFeatures.length);

          let polygonInstanceCount = 0;
          const renderedBounds = createEmptyBoundaryBounds();
          const firstFeature = seoulFeatures[0] ?? null;
          const firstFeatureProperties = firstFeature
            ? getGeoJsonDongProperties(firstFeature)
            : null;
          const firstCoordinate = firstFeature ? getFirstGeoJsonCoordinate(firstFeature) : null;

          seoulFeatures.forEach((feature) => {
            const properties = getGeoJsonDongProperties(feature);

            if (!properties) {
              return;
            }

            const { dongCode, dongName } = properties;
            const visitCount = visitCountByDongRef.current.get(dongCode) ?? 0;
            const geometry = feature.geometry;

            if (geometry.type === "Polygon") {
              drawPolygon(geometry.coordinates, dongCode, dongName, visitCount, renderedBounds);
              polygonInstanceCount += 1;
            }

            if (geometry.type === "MultiPolygon") {
              geometry.coordinates.forEach((polygonCoords) => {
                drawPolygon(polygonCoords, dongCode, dongName, visitCount, renderedBounds);
                polygonInstanceCount += 1;
              });
            }
          });

          if (firstCoordinate && firstFeatureProperties) {
            const [lng, lat] = firstCoordinate;
            console.info("GeoJSON first Seoul feature coordinate sample.", {
              emdName: firstFeatureProperties.dongName,
              emdCode: firstFeatureProperties.dongCode,
              geometryType: firstFeature?.geometry.type,
              coordinate: [lng, lat],
              naverLatLngInput: { lat, lng },
            });
          }

          console.info("GeoJSON boundary render complete.", {
            path: EUPMYEONDONG_GEOJSON_PATH,
            totalFeatures: geojson.features.length,
            seoulFeatures: seoulFeatures.length,
            polygonInstances: polygonInstanceCount,
            polygonGroups: polygonGroupsRef.current.size,
            bounds: renderedBounds,
          });

          if (
            DEBUG_FIT_BOUNDS_TO_BOUNDARY &&
            Number.isFinite(renderedBounds.minLng) &&
            Number.isFinite(renderedBounds.minLat) &&
            naverApi.maps.LatLngBounds
          ) {
            map.fitBounds(
              new naverApi.maps.LatLngBounds(
                new naverApi.maps.LatLng(renderedBounds.minLat, renderedBounds.minLng),
                new naverApi.maps.LatLng(renderedBounds.maxLat, renderedBounds.maxLng)
              )
            );
          }
        } catch (error) {
          console.warn("GeoJSON boundary render failed.", error);
          setStatusMessage("GeoJSON 경계 데이터를 렌더링하지 못했습니다.");
        }
      }

      function drawPolygon(
        coords: PolygonCoordinates,
        dongCode: string,
        dongName: string,
        initialVisitCount: number,
        bounds: BoundaryBounds
      ) {
        const paths = coords.map((ring) =>
          ring.map(([lng, lat]: number[]) => {
            extendBoundaryBounds(bounds, lng, lat);

            return new naverApi.maps.LatLng(lat, lng);
          })
        );

        const polygon = new naverApi.maps.Polygon({
          map,
          paths,
          clickable: true,
          zIndex: topStatDongCodesRef.current.has(dongCode) ? 180 : initialVisitCount > 0 ? 100 : 10,
          ...(topStatDongCodesRef.current.has(dongCode)
            ? getTopStatDongStyle()
            : getVisitStyle(initialVisitCount)),
        });

        const existingGroup = polygonGroupsRef.current.get(dongCode) ?? [];
        existingGroup.push(polygon);
        polygonGroupsRef.current.set(dongCode, existingGroup);

        naverApi.maps.Event.addListener(polygon, "mouseover", () => {
          const currentVisitCount = visitCountByDongRef.current.get(dongCode) ?? 0;
          const isSelected = selectedDongCodeRef.current === dongCode;
          const isTopStat = topStatDongCodesRef.current.has(dongCode);
          setHoverLabel(dongName);

          if (!isSelected) {
            polygon.setOptions({
              ...(isTopStat ? getTopStatDongStyle() : getHoverVisitStyle(currentVisitCount)),
              zIndex: isTopStat ? 180 : currentVisitCount > 0 ? 150 : 60,
            });
          }
        });

        naverApi.maps.Event.addListener(polygon, "mouseout", () => {
          setHoverLabel(null);

          if (selectedDongCodeRef.current === dongCode) {
            polygon.setOptions({ ...getSelectedDongStyle(), zIndex: 300 });
            return;
          }

          const currentVisitCount = visitCountByDongRef.current.get(dongCode) ?? 0;
          const isTopStat = topStatDongCodesRef.current.has(dongCode);
          polygon.setOptions({
            ...(isTopStat ? getTopStatDongStyle() : getVisitStyle(currentVisitCount)),
            zIndex: isTopStat ? 180 : currentVisitCount > 0 ? 100 : 10,
          });
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
          const previousSelectedDongCode = selectedDongCodeRef.current;
          selectedDongCodeRef.current = dongCode;
          setSelectedDong({ dongCode, dongName, visitCount: currentVisitCount });
          setIsDongPanelOpen(true);
          setIsDrawerOpen(false);

          if (previousSelectedDongCode && previousSelectedDongCode !== dongCode) {
            restyleDong(previousSelectedDongCode);
          }

          applyPolygonStyle(dongCode, getSelectedDongStyle(), 300);

          if (clickPulseTimerRef.current) {
            clearTimeout(clickPulseTimerRef.current);
          }

          clickPulseTimerRef.current = setTimeout(() => {
            clearClickPulse(dongCode);
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
  }, [applyPolygonStyle, clearClickPulse, restyleDong]);

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
          entry_date: diaryEntryDate || getTodayDateValue(),
        })
        .select("id, dong_code, dong_name, title, content, photo_url, entry_date, created_at")
        .single();

      if (error) {
        throw error;
      }

      const savedDiary = data as DongDiary;
      setDiaries((current) => [savedDiary, ...current]);
      setAllDiaries((current) => [savedDiary, ...current]);
      setDiaryTitle("");
      setDiaryContent("");
      setDiaryEntryDate(getTodayDateValue());
      clearPhotoSelection();
      setPhotoLink("");
      // After successful diary insert, increment visited_places.visit_count for this user only.
      try {
        const nextVisitCount = Math.max(
          visitCountByDongRef.current.get(selectedDong.dongCode) ?? 0,
          diaries.length
        ) + 1;
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
          restyleDong(selectedDong!.dongCode);
          setVisitStats(() => {
            const visitEntries = Array.from(visitCountByDongRef.current.entries());
            const nextVisitedDongCount = visitEntries.filter(([, count]) => count > 0).length;
            const nextTotalVisitCount = visitEntries.reduce(
              (sum, [, count]) => sum + count,
              0
            );

            let topDongCode: string | null = null;
            let nextTopVisitCount = 0;

            visitEntries.forEach(([dongCode, count]) => {
              if (count > nextTopVisitCount) {
                nextTopVisitCount = count;
                topDongCode = dongCode;
              }
            });

            topStatDongCodesRef.current =
              nextTopVisitCount > 0
                ? new Set(
                    visitEntries
                      .filter(([, count]) => count === nextTopVisitCount)
                      .map(([dongCode]) => dongCode)
                  )
                : new Set<string>();

            polygonGroupsRef.current.forEach((_, dongCode) => {
              restyleDong(dongCode);
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
    setDiaryEntryDate(getTodayDateValue());
    setPhotoLink("");
  }

  async function handleDeleteCurrentMap() {
    if (!currentMap || currentMap.role !== "owner") {
      setDeleteMessage("지도 소유자만 삭제할 수 있습니다.");
      return;
    }

    const confirmed =
      deleteConfirmText.trim() === "삭제" || deleteConfirmText.trim() === currentMap.title;

    if (!confirmed) {
      setDeleteMessage(`삭제하려면 "삭제" 또는 "${currentMap.title}"을 입력하세요.`);
      return;
    }

    setIsDeletingMap(true);
    setDeleteMessage(null);

    const result = await deleteMap(currentMap.id);

    if (result.ok) {
      setIsDeleteOpen(false);
      setDeleteConfirmText("");
      setSelectedDong(null);
      selectedDongCodeRef.current = null;
      setIsDongPanelOpen(false);
      setDiaries([]);
      setAllDiaries([]);
    } else {
      setDeleteMessage(result.errorMessage);
    }

    setIsDeletingMap(false);
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

  const ownedMaps = maps.filter((map) => map.role === "owner");
  const sharedMaps = maps.filter((map) => map.role !== "owner");
  const visitedRatio =
    totalDongCount > 0 ? Math.round((visitStats.visitedDongCount / totalDongCount) * 100) : 0;
  const mapTitle = currentMap?.title ?? (isLoadingMaps ? "지도 불러오는 중" : "서울 동 단위 여행 일기");
  const drawerTabs: { id: DrawerTab; label: string }[] = [
    { id: "map", label: "지도" },
    { id: "settings", label: "설정" },
    { id: "stats", label: "통계" },
    { id: "status", label: "현황" },
    { id: "records", label: "전체 기록" },
    { id: "account", label: "계정" },
  ];
  const renderTimelineSortSelect = () => (
    <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
      정렬
      <select
        value={timelineSort}
        onChange={(event) => setTimelineSort(event.target.value as TimelineSort)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm font-medium normal-case tracking-normal text-white outline-none focus:border-sky-300"
      >
        <option value="entry-desc">기록 날짜 최신순</option>
        <option value="entry-asc">기록 날짜 오래된순</option>
        <option value="created-desc">작성일 최신순</option>
      </select>
    </label>
  );

  return (
    <main className="min-h-dvh overflow-hidden bg-slate-950 text-slate-900">
      <header className="fixed inset-x-0 top-0 z-[60] border-b border-white/10 bg-slate-950/90 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white shadow-lg shadow-slate-950/20 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-3">
          <button
            type="button"
            data-testid="main-menu-button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
            aria-label="메뉴 열기"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
              Travel Map Diary
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-base">
              {currentMap?.icon ? `${currentMap.icon} ` : ""}
              {mapTitle}
            </h1>
          </div>
          {selectedDong ? (
            <span className="hidden max-w-[180px] truncate rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 sm:block">
              {selectedDong.dongName}
            </span>
          ) : null}
        </div>
      </header>

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
              <label className="block space-y-2 text-sm font-semibold text-slate-700">
                <span>기록 날짜</span>
                <input
                  type="date"
                  value={diaryEntryDate}
                  onChange={(event) => setDiaryEntryDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-950 outline-none focus:border-sky-500"
                />
              </label>
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
      {isDrawerOpen ? (
        <div className="fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-sm">
          <aside className="ml-auto flex h-full w-full max-w-md flex-col bg-slate-950 text-slate-100 shadow-2xl sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-[28px]">
            <div className="border-b border-white/10 px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                    Travel Map Diary
                  </p>
                  <h2 className="mt-1 truncate text-xl font-semibold">
                    {currentMap?.icon ? `${currentMap.icon} ` : ""}
                    {mapTitle}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white"
                >
                  닫기
                </button>
              </div>
              <section className="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                  지도 선택
                </p>
                {authUser ? (
                  <>
                    <h3 className="mt-2 truncate text-lg font-semibold">
                      {currentMap?.title ?? "선택된 지도 없음"}
                    </h3>
                    <p className="mt-1 truncate text-sm text-slate-300">
                      현재 사용할 지도를 선택하세요.
                    </p>
                    {maps.length > 0 ? (
                      <select
                        value={currentMap?.id ?? ""}
                        onChange={(event) => selectMap(event.target.value)}
                        disabled={isLoadingMaps}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none focus:border-sky-300 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        {ownedMaps.length > 0 ? (
                          <optgroup label="내 지도">
                            {ownedMaps.map((map) => (
                              <option key={map.id} value={map.id}>
                                {map.icon ? `${map.icon} ` : ""}
                                {map.title}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        {sharedMaps.length > 0 ? (
                          <optgroup label="공유받은 지도">
                            {sharedMaps.map((map) => (
                              <option key={map.id} value={map.id}>
                                {map.icon ? `${map.icon} ` : ""}
                                {map.title}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </select>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-slate-200">
                        아직 사용할 수 있는 지도가 없습니다.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="mt-2 truncate text-lg font-semibold">선택된 지도 없음</h3>
                    <p className="mt-1 text-sm text-slate-300">
                      지도를 만들려면 먼저 로그인해 주세요.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Link href="/login" className="rounded-2xl bg-sky-400 px-4 py-3 text-center text-sm font-semibold text-slate-950">
                        로그인
                      </Link>
                      <Link href="/signup" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white">
                        회원가입
                      </Link>
                    </div>
                  </>
                )}
              </section>
              <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-white/5 p-1">
                {drawerTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`drawer-tab-${tab.id}`}
                    onClick={() => setActiveDrawerTab(tab.id)}
                    className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
                      activeDrawerTab === tab.id
                        ? "bg-sky-400 text-slate-950"
                        : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {activeDrawerTab === "map" ? (
                <div className="space-y-4">
                  {authUser ? (
                    <section className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                        현재 지도
                      </p>
                      <h3 className="mt-2 text-lg font-semibold">
                        {currentMap?.icon ? `${currentMap.icon} ` : ""}
                        {currentMap?.title ?? "지도 없음"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {currentMap?.description ??
                          (currentMap ? "지도 설명이 없습니다." : "지도를 만들거나 선택하세요.")}
                      </p>
                      {mapError ? (
                        <p className="mt-3 rounded-2xl border border-sky-300/30 bg-sky-950/40 px-4 py-3 text-sm font-medium text-slate-100">
                          {mapError}
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              ) : null}

              {activeDrawerTab === "settings" ? (
                <div className="space-y-4">
                  <section className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                      지도 설정
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">
                      {currentMap?.icon ? `${currentMap.icon} ` : ""}
                      {currentMap?.title ?? "선택된 지도 없음"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {authUser
                        ? "지도 생성, 정보 수정, 공유, 삭제를 이곳에서 관리합니다."
                        : "로그인하면 지도 관리 기능을 사용할 수 있습니다."}
                    </p>
                  </section>

                  {authUser ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className="rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950"
                      >
                        새 지도 만들기
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditOpen(true)}
                        disabled={currentMap?.role !== "owner"}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        지도 정보 수정
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsShareOpen(true)}
                        disabled={currentMap?.role !== "owner"}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:text-slate-500 sm:col-span-2"
                      >
                        지도 공유 관리
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmText("");
                          setDeleteMessage(null);
                          setIsDeleteOpen(true);
                        }}
                        disabled={currentMap?.role !== "owner"}
                        className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 disabled:cursor-not-allowed disabled:text-slate-500 sm:col-span-2"
                      >
                        지도 삭제
                      </button>
                      {currentMap && currentMap.role !== "owner" ? (
                        <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300 sm:col-span-2">
                          지도 정보 수정, 공유, 삭제는 소유자만 사용할 수 있습니다.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeDrawerTab === "stats" ? (
                <div className="space-y-3" data-testid="visit-stats">
                  {visitBadgeItems.map((item) => (
                    <div key={item.label} className={`flex items-center gap-3 rounded-[24px] border px-4 py-4 ${item.toneClassName}`}>
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/80 shadow-sm">
                        {item.icon}
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
                          {item.label}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">{item.value}</p>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                      방문 비율
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{visitedRatio}%</p>
                    <p className="mt-1 text-sm text-slate-300">
                      전체 {totalDongCount}개 동 중 {visitStats.visitedDongCount}개 방문
                    </p>
                  </div>
                </div>
              ) : null}

              {activeDrawerTab === "status" ? (
                <div className="space-y-3">
                  {[
                    ["방문 전", "#E5E7EB", "아직 기록이 없는 동입니다."],
                    ["방문 있음", "#22C55E", "방문 기록이 있는 동입니다."],
                    ["통계 상위 동", "#F59E0B", visitStats.topDongName ? `${visitStats.topDongName} · ${visitStats.topVisitCount}회` : "아직 상위 동이 없습니다."],
                    ["선택된 동", "#BDE8F5", selectedDong ? selectedDong.dongName : "아직 선택된 동이 없습니다."],
                  ].map(([label, color, detail]) => (
                    <div key={label} className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <span className="h-4 w-4 rounded-full border border-white/50" style={{ backgroundColor: color }} />
                      <div>
                        <p className="font-semibold">{label}</p>
                        <p className="text-sm text-slate-300">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {activeDrawerTab === "records" ? (
                <div className="space-y-3">
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                      현재 지도 전체 기록
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">
                      {currentMap?.title ?? "지도 없음"}
                    </h3>
                  </div>
                  {renderTimelineSortSelect()}
                  <input
                    value={recordSearch}
                    onChange={(event) => setRecordSearch(event.target.value)}
                    placeholder="동 이름으로 검색"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300"
                  />
                  {isLoadingAllDiaries ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-slate-300">
                      전체 기록을 불러오는 중입니다.
                    </div>
                  ) : sortedAllDiaries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-slate-300">
                      표시할 기록이 없습니다.
                    </div>
                  ) : (
                    sortedAllDiaries.map((diary) => (
                      <article key={diary.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                        {diary.photo_url ? (
                          <div className="relative h-40 w-full">
                            <Image src={diary.photo_url} alt={diary.title ?? diary.dong_name} fill unoptimized className="object-cover" />
                          </div>
                        ) : null}
                        <div className="space-y-3 p-4">
                          <p className="text-xs font-semibold text-sky-300">{diary.dong_name}</p>
                          <h4 className="text-base font-semibold text-white">
                            {diary.title ?? diary.dong_name}
                          </h4>
                          <div className="space-y-1 text-xs text-slate-400">
                            <p>기록 날짜: {formatEntryDate(diary.entry_date, diary.created_at)}</p>
                            <p>작성: {formatDateTime(diary.created_at)}</p>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                            {diary.content}
                          </p>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              ) : null}

              {activeDrawerTab === "account" ? (
                <div className="space-y-4">
                  <section className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
                      계정
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">
                      {authUser?.email ? authUser.email.split("@")[0] : "로그인 전"}
                    </h3>
                    <p className="mt-2 text-sm text-slate-300">
                      {authUser ? "세션이 유지되고 있습니다." : "로그인하면 개인 지도를 사용할 수 있습니다."}
                    </p>
                  </section>
                  {authUser ? (
                    <div className="grid gap-2">
                      <Link href="/profile" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
                        프로필
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        disabled={isAuthSubmitting}
                        className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-left text-sm font-semibold text-rose-200 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        {isAuthSubmitting ? "로그아웃 중" : "로그아웃"}
                      </button>
                    </div>
                  ) : null}
                  {authMessage ? (
                    <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
                      {authMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {isDongPanelOpen && selectedDong ? (
        <div className="fixed inset-x-0 bottom-0 z-[55] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:bottom-5 lg:left-auto lg:right-5 lg:w-[420px] lg:p-0">
          <section className="max-h-[72dvh] overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 text-white shadow-[0_28px_80px_rgba(15,23,42,0.36)]">
            <div className="border-b border-white/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">
                    선택된 동
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{selectedDong.dongName}</h2>
                  <p className="mt-1 text-sm text-slate-300">방문 {selectedDongVisitCount}회</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const dongCode = selectedDongCodeRef.current;
                    selectedDongCodeRef.current = null;
                    setIsDongPanelOpen(false);
                    setSelectedDong(null);
                    if (dongCode) {
                      restyleDong(dongCode);
                    }
                  }}
                  className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white"
                >
                  닫기
                </button>
              </div>
              <div className="mt-4 flex gap-2">
                {canEditCurrentMap ? (
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="rounded-2xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    일기 추가
                  </button>
                ) : (
                  <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                    읽기 전용 지도
                  </span>
                )}
              </div>
            </div>
            <div className="max-h-[46dvh] space-y-3 overflow-y-auto p-4">
              {renderTimelineSortSelect()}
              {isLoadingDiaries ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  일기를 불러오는 중입니다.
                </div>
              ) : diaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  아직 작성된 일기가 없습니다.
                </div>
              ) : (
                sortedDiaries.map((diary) => (
                  <article key={diary.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    {diary.photo_url ? (
                      <div className="relative h-36 w-full">
                        <Image src={diary.photo_url} alt={diary.title ?? diary.dong_name} fill unoptimized className="object-cover" />
                      </div>
                    ) : null}
                    <div className="space-y-2 p-4">
                      <h3 className="font-semibold">{diary.title ?? diary.dong_name}</h3>
                      <div className="space-y-1 text-xs text-slate-400">
                        <p>기록 날짜: {formatEntryDate(diary.entry_date, diary.created_at)}</p>
                        <p>작성: {formatDateTime(diary.created_at)}</p>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                        {diary.content}
                      </p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      <div className="mx-auto grid min-h-dvh w-full max-w-[1600px] gap-4 px-0 pb-0 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:block">
        <section className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] min-h-[70vh] flex-col overflow-hidden bg-white/80 shadow-[0_30px_80px_rgba(15,23,42,0.14)] backdrop-blur lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top))]">
          <div className="hidden flex-col gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
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
                data-testid="legacy-visit-stats"
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
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div ref={mapRef} data-testid="map-viewport" className="h-full w-full" />
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

            <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden max-w-[calc(100%-1.5rem)] sm:bottom-4 sm:left-4">
              <div className="rounded-2xl border border-white/70 bg-white/90 p-2 shadow-lg backdrop-blur sm:p-4">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:mb-2 sm:text-[11px] sm:tracking-[0.24em]">
                  Legend
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                    <span className="h-2 w-2 rounded-full border border-[#9CA3AF] bg-[#E5E7EB]" />
                    방문 전
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                    <span className="h-2 w-2 rounded-full border border-[#15803D] bg-[#22C55E]" />
                    방문 있음
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                    <span className="h-2 w-2 rounded-full border border-[#B45309] bg-[#F59E0B]" />
                    통계 상위
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                    <span className="h-2 w-2 rounded-full border-2 border-[#0F2854] bg-[#BDE8F5]" />
                    선택됨
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>
      </div>
      <MapCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={async (title, description) => createMap(title, description)}
      />
      <MapEditModal
        isOpen={isEditOpen}
        map={currentMap}
        onClose={() => setIsEditOpen(false)}
        onSave={async (mapId, input) => updateMap(mapId, input)}
      />
      <MapShareModal
        isOpen={isShareOpen}
        map={currentMap}
        onClose={() => setIsShareOpen(false)}
      />
      {isDeleteOpen && currentMap ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">
              Delete map
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">지도 삭제</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {currentMap.title} 지도를 삭제하면 연결된 방문 기록과 일기도 함께 삭제됩니다.
            </p>
            <label className="mt-5 block space-y-2 text-sm font-semibold text-slate-700">
              <span>확인을 위해 &quot;삭제&quot; 또는 지도 이름을 입력하세요.</span>
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-950 outline-none focus:border-rose-400"
              />
            </label>
            {deleteMessage ? (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                {deleteMessage}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteCurrentMap}
                disabled={isDeletingMap}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isDeletingMap ? "삭제 중" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
