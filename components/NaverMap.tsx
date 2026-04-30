"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { supabase } from "../lib/supabase";
import MapCreateModal from "@/components/MapCreateModal";
import MapEditModal from "@/components/MapEditModal";
import MapShareModal from "@/components/MapShareModal";
import { SIDO_CODE_MAP, SIGUNGU_CODE_MAP } from "@/lib/administrativeCodes";
import {
  ImageCompressionError,
  compressImageBeforeUpload,
  formatBytes,
} from "@/lib/imageCompression";
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
  // Legacy DB naming: dong_code/dong_name now store nationwide emd_code/emd_name.
  dongCode: string;
  dongName: string;
  regionLabel: string;
  sigCode: string | null;
  visitCount: number;
};

type VisitStats = {
  visitedDongCount: number;
  totalVisitCount: number;
  topDongName: string | null;
  topVisitCount: number;
};

type VisitCountBuckets = {
  one: string[];
  twoToThree: string[];
  fourToSix: string[];
  sevenPlus: string[];
};

type DrawerTab = "map" | "settings" | "stats" | "status" | "records" | "account";
type TimelineSort = "entry-desc" | "entry-asc" | "created-desc";

type DongDiary = {
  id: string;
  // Legacy DB naming: dong_code/dong_name now store nationwide emd_code/emd_name.
  dong_code: string;
  dong_name: string;
  title: string | null;
  content: string;
  photo_url: string | null;
  entry_date: string | null;
  created_at: string;
};

type BoundaryFeature = {
  properties: {
    emd_code?: string | number;
    emd_name?: string;
    sig_code?: string | number;
    sido_code?: string | number;
    sido_name?: string;
    sig_name?: string;
    full_name?: string;
    EMD_CD?: string | number;
    EMD_NM?: string;
    SIG_CD?: string | number;
    SIG_KOR_NM?: string;
    CTP_KOR_NM?: string;
  };
};

type NaverLatLng = {
  lat: () => number;
  lng: () => number;
};

type NaverMapInstance = {
  getCenter: () => NaverLatLng;
  getZoom: () => number;
  getSize?: () => unknown;
  setCenter: (center: unknown) => void;
  setZoom: (zoom: number) => void;
};

type NaverMapApi = {
  maps: {
    Map: new (
      element: HTMLDivElement,
      options: {
        center: unknown;
        zoom: number;
        scrollWheel?: boolean;
        draggable?: boolean;
        disableDoubleClickZoom: boolean;
        pinchZoom?: boolean;
      }
    ) => NaverMapInstance;
    LatLng: new (lat: number, lng: number) => unknown;
    Event: {
      addListener: (
        target: NaverMapInstance,
        eventName: string,
        handler: () => void
      ) => unknown;
      trigger: (target: NaverMapInstance, eventName: string) => void;
    };
  };
};

type NaverWindow = Window & {
  naver?: NaverMapApi;
  __setOverlayZoomOffset?: (offset: number) => void;
};

const EUPMYEONDONG_PMTILES_PATH = "/tiles/eupmyeondong.pmtiles";
const EUPMYEONDONG_SOURCE_ID = "eupmyeondong";
const EUPMYEONDONG_SOURCE_LAYER = "eupmyeondong";
const EUPMYEONDONG_FILL_LAYER_ID = "eupmyeondong-fill";
const EUPMYEONDONG_LINE_LAYER_ID = "eupmyeondong-line";
const NATIONAL_EUPMYEONDONG_COUNT = 5028;
const KOREA_CENTER: [number, number] = [127.8, 36.3];
const NAVER_INITIAL_ZOOM = 7;
const INITIAL_MAPLIBRE_ZOOM_OFFSET = Number.parseFloat(
  process.env.NEXT_PUBLIC_MAPLIBRE_ZOOM_OFFSET ?? "-1"
);
const DEFAULT_MAPLIBRE_ZOOM_OFFSET = Number.isFinite(INITIAL_MAPLIBRE_ZOOM_OFFSET)
  ? INITIAL_MAPLIBRE_ZOOM_OFFSET
  : 0;
const DEBUG_MAP_MODE = (process.env.NEXT_PUBLIC_DEBUG_MAP_MODE ?? "both") as
  | "naver-only"
  | "overlay-only"
  | "both";
const DEBUG_BOUNDARY_STYLE = process.env.NEXT_PUBLIC_DEBUG_BOUNDARY_STYLE === "true";
const DEBUG_FIXED_OVERLAY_VIEW = process.env.NEXT_PUBLIC_DEBUG_FIXED_OVERLAY_VIEW === "true";
const DEBUG_OVERLAY_BACKGROUND = process.env.NEXT_PUBLIC_DEBUG_OVERLAY_BACKGROUND === "true";
const DEBUG_MAP_SYNC = process.env.NEXT_PUBLIC_DEBUG_MAP_SYNC === "true";
const DEBUG_REGION_LABEL = process.env.NEXT_PUBLIC_DEBUG_REGION_LABEL === "true";
const OVERLAY_MOVING_OPACITY = "0.22";
const OVERLAY_IDLE_OPACITY = "1";

let isPmtilesProtocolRegistered = false;
const missingSigunguLogSet = new Set<string>();
const mojibakeLogSet = new Set<string>();
let boundaryPropertySampleLogCount = 0;

const REGION_VISIT_COLORS = {
  default: {
    fillColor: "#F3F7FA",
    strokeColor: "#B6C3D1",
    fillOpacity: 0.12,
    strokeOpacity: 0.65,
    strokeWeight: 0.7,
  },
  one: {
    fillColor: "#BDE8F5",
    strokeColor: "#7DB8D1",
    fillOpacity: 0.35,
    strokeOpacity: 0.48,
    strokeWeight: 0.55,
  },
  twoToThree: {
    fillColor: "#4988C4",
    strokeColor: "#1C4D8D",
    fillOpacity: 0.45,
    strokeOpacity: 0.9,
    strokeWeight: 0.95,
  },
  fourToSix: {
    fillColor: "#1C4D8D",
    strokeColor: "#0F2854",
    fillOpacity: 0.55,
    strokeOpacity: 0.95,
    strokeWeight: 1.1,
  },
  sevenPlus: {
    fillColor: "#0F2854",
    strokeColor: "#0F2854",
    fillOpacity: 0.65,
    strokeOpacity: 1,
    strokeWeight: 1.2,
  },
} satisfies Record<string, VisitStyle>;

const REGION_STATUS_COLORS = {
  topStat: {
    fillColor: "#1C4D8D",
    strokeColor: "#0F2854",
    fillOpacity: 0.6,
    strokeOpacity: 1,
    strokeWeight: 2.2,
  },
  selected: {
    fillColor: "#BDE8F5",
    strokeColor: "#0F2854",
    fillOpacity: 0.65,
    strokeOpacity: 1,
    strokeWeight: 3,
  },
} satisfies Record<string, VisitStyle>;

function getRegionStyleByVisitCount(visitCount: number): VisitStyle {
  if (visitCount >= 7) return REGION_VISIT_COLORS.sevenPlus;
  if (visitCount >= 4) return REGION_VISIT_COLORS.fourToSix;
  if (visitCount >= 2) return REGION_VISIT_COLORS.twoToThree;
  if (visitCount >= 1) return REGION_VISIT_COLORS.one;

  return REGION_VISIT_COLORS.default;
}

function getVisitStyle(count: number): VisitStyle {
  return getRegionStyleByVisitCount(count);
}

function getTopStatDongStyle(): VisitStyle {
  return REGION_STATUS_COLORS.topStat;
}

function getSelectedDongStyle(): VisitStyle {
  return REGION_STATUS_COLORS.selected;
}

function getBoundaryFeatureProperties(feature: BoundaryFeature | null | undefined) {
  if (!feature?.properties) {
    return null;
  }

  const dongCode = feature.properties.emd_code ?? feature.properties.EMD_CD;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dongName = feature.properties.emd_name ?? feature.properties.EMD_NM ?? "이름 없는 지역";
  const sigCode = feature.properties.sig_code ?? feature.properties.SIG_CD ?? null;

  if (!dongCode) {
    return null;
  }

  return {
    dongCode: String(dongCode),
    dongName: getSafeRegionName(feature.properties),
    regionLabel: formatSafeRegionLabel(feature.properties),
    sigCode: sigCode ? String(sigCode) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatRegionLabel(properties: BoundaryFeature["properties"]) {
  if (properties.full_name) {
    return String(properties.full_name);
  }

  const emdCode = properties.emd_code ?? properties.EMD_CD;
  const emdName = properties.emd_name ?? properties.EMD_NM ?? "이름 없는 지역";
  const sigCode = properties.sig_code ?? properties.SIG_CD;
  const derivedSigCode = String(emdCode ?? "").slice(0, 5);
  const sidoCodeFromProperty = properties.sido_code ? String(properties.sido_code) : null;
  const sigName =
    properties.sig_name ??
    properties.SIG_KOR_NM ??
    SIGUNGU_CODE_MAP[derivedSigCode] ??
    (sigCode ? SIGUNGU_CODE_MAP[String(sigCode)] : null);
  const sidoCode = sidoCodeFromProperty ?? String(emdCode ?? sigCode ?? "").slice(0, 2);
  const sidoName = properties.sido_name ?? properties.CTP_KOR_NM ?? SIDO_CODE_MAP[sidoCode];

  if (sidoName && sigName) {
    return `${sidoName} ${sigName} ${emdName}`;
  }

  if (sidoName) {
    if (sigCode || derivedSigCode) {
      const missingKey = `${derivedSigCode || sigCode}:${emdName}`;

      if (!missingSigunguLogSet.has(missingKey)) {
        missingSigunguLogSet.add(missingKey);
        console.warn("[RegionLabel] sig_code mapping missing; falling back to sido + emd.", {
          emdCode,
          emdName,
          derivedSigCode,
          sigCode,
          sidoName,
        });
      }
    }

    return `${sidoName} ${emdName}`;
  }

  return String(emdName);
}

function isLikelyMojibake(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const text = value.trim();

  if (!text) {
    return false;
  }

  if (text.includes("\uFFFD")) {
    return true;
  }

  if (text.includes("?")) {
    return true;
  }

  if (/[ÃÂãìíîïëêðŸ]/.test(text)) {
    return true;
  }

  const mojibakePattern = /[\u6FE1\u71EE\uBE1A\uD76C\u8E42\u6028\u7B4C\u75AB\u56A5\u63F6\u96C5\uF9CF\uF9CE\u8ADB\u91AB\u7652\uF9CE\uF9DE\uF9E2\uF9EC\uF9F0]/g;
  const mojibakeHits = text.match(mojibakePattern)?.length ?? 0;

  if (mojibakeHits >= 1) {
    return true;
  }

  const hangulCount = (text.match(/[\uAC00-\uD7A3]/g) ?? []).length;
  const suspiciousCjkCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;

  return suspiciousCjkCount >= 1 && suspiciousCjkCount >= hangulCount;
}

function warnMojibakeOnce(fieldName: string, value: unknown) {
  const key = `${fieldName}:${String(value).slice(0, 80)}`;

  if (mojibakeLogSet.has(key)) {
    return;
  }

  mojibakeLogSet.add(key);
  console.warn("[RegionLabel] rejected mojibake property.", { fieldName, value });
}

function getCleanLabelPart(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).normalize("NFC").trim();

  if (!text) {
    return null;
  }

  if (isLikelyMojibake(text)) {
    warnMojibakeOnce(fieldName, text);
    return null;
  }

  return text;
}

function logBoundaryPropertySample(properties: BoundaryFeature["properties"], label: string) {
  if (!DEBUG_REGION_LABEL) {
    return;
  }

  if (boundaryPropertySampleLogCount >= 10) {
    return;
  }

  boundaryPropertySampleLogCount += 1;
  console.info("[RegionLabel] property sample", {
    raw: properties,
    label,
    rejected: {
      fullName: isLikelyMojibake(properties.full_name),
      sidoName: isLikelyMojibake(properties.sido_name ?? properties.CTP_KOR_NM),
      sigName: isLikelyMojibake(properties.sig_name ?? properties.SIG_KOR_NM),
      emdName: isLikelyMojibake(properties.emd_name ?? properties.EMD_NM),
    },
  });
}

function getSafeRegionName(properties: BoundaryFeature["properties"]) {
  return getCleanLabelPart(properties.emd_name ?? properties.EMD_NM, "emd_name") ?? "\uC774\uB984 \uC5C6\uB294 \uC9C0\uC5ED";
}

function formatSafeRegionLabel(properties: BoundaryFeature["properties"]) {
  const fullName = getCleanLabelPart(properties.full_name, "full_name");

  if (fullName) {
    logBoundaryPropertySample(properties, fullName);
    return fullName;
  }

  const emdCode = properties.emd_code ?? properties.EMD_CD;
  const sigCode = properties.sig_code ?? properties.SIG_CD;
  const emdName = getSafeRegionName(properties);
  const derivedSigCode = String(emdCode ?? "").slice(0, 5);
  const sidoCodeFromProperty = properties.sido_code ? String(properties.sido_code) : null;
  const sigName =
    getCleanLabelPart(properties.sig_name ?? properties.SIG_KOR_NM, "sig_name") ??
    SIGUNGU_CODE_MAP[derivedSigCode] ??
    (sigCode ? SIGUNGU_CODE_MAP[String(sigCode)] : null);
  const sidoCode = sidoCodeFromProperty ?? String(emdCode ?? sigCode ?? "").slice(0, 2);
  const sidoName =
    getCleanLabelPart(properties.sido_name ?? properties.CTP_KOR_NM, "sido_name") ??
    SIDO_CODE_MAP[sidoCode];

  if (sidoName && sigName) {
    const label = `${sidoName} ${sigName} ${emdName}`;
    logBoundaryPropertySample(properties, label);
    return label;
  }

  if (sidoName) {
    if (sigCode || derivedSigCode) {
      const missingKey = `${derivedSigCode || sigCode}:${emdName}`;

      if (!missingSigunguLogSet.has(missingKey)) {
        missingSigunguLogSet.add(missingKey);
        console.warn("[RegionLabel] sig_code mapping missing; falling back to sido + emd.", {
          emdCode,
          emdName,
          derivedSigCode,
          sigCode,
          sidoName,
        });
      }
    }

    const label = `${sidoName} ${emdName}`;
    logBoundaryPropertySample(properties, label);
    return label;
  }

  logBoundaryPropertySample(properties, emdName);
  return emdName;
}

function getVisitCountBuckets(visitCounts: Map<string, number>): VisitCountBuckets {
  const buckets: VisitCountBuckets = {
    one: [],
    twoToThree: [],
    fourToSix: [],
    sevenPlus: [],
  };

  visitCounts.forEach((count, dongCode) => {
    if (count >= 7) {
      buckets.sevenPlus.push(dongCode);
    } else if (count >= 4) {
      buckets.fourToSix.push(dongCode);
    } else if (count >= 2) {
      buckets.twoToThree.push(dongCode);
    } else if (count >= 1) {
      buckets.one.push(dongCode);
    }
  });

  return buckets;
}

function buildVisitFillExpression(
  selectedDongCode: string | null,
  topStatDongCodes: string[],
  visitCountBuckets: VisitCountBuckets
) {
  return [
    "case",
    ["==", ["get", "emd_code"], selectedDongCode ?? ""],
    getSelectedDongStyle().fillColor,
    ["in", ["get", "emd_code"], ["literal", topStatDongCodes]],
    getTopStatDongStyle().fillColor,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.sevenPlus]],
    getVisitStyle(7).fillColor,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.fourToSix]],
    getVisitStyle(4).fillColor,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.twoToThree]],
    getVisitStyle(2).fillColor,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.one]],
    getVisitStyle(1).fillColor,
    getVisitStyle(0).fillColor,
  ];
}

function buildVisitOpacityExpression(
  selectedDongCode: string | null,
  topStatDongCodes: string[],
  visitCountBuckets: VisitCountBuckets
) {
  return [
    "case",
    ["==", ["get", "emd_code"], selectedDongCode ?? ""],
    getSelectedDongStyle().fillOpacity,
    ["in", ["get", "emd_code"], ["literal", topStatDongCodes]],
    getTopStatDongStyle().fillOpacity,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.sevenPlus]],
    getVisitStyle(7).fillOpacity,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.fourToSix]],
    getVisitStyle(4).fillOpacity,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.twoToThree]],
    getVisitStyle(2).fillOpacity,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.one]],
    getVisitStyle(1).fillOpacity,
    getVisitStyle(0).fillOpacity,
  ];
}

function buildVisitStrokeExpression(
  selectedDongCode: string | null,
  topStatDongCodes: string[],
  visitCountBuckets: VisitCountBuckets
) {
  return [
    "case",
    ["==", ["get", "emd_code"], selectedDongCode ?? ""],
    getSelectedDongStyle().strokeColor,
    ["in", ["get", "emd_code"], ["literal", topStatDongCodes]],
    getTopStatDongStyle().strokeColor,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.sevenPlus]],
    getVisitStyle(7).strokeColor,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.fourToSix]],
    getVisitStyle(4).strokeColor,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.twoToThree]],
    getVisitStyle(2).strokeColor,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.one]],
    getVisitStyle(1).strokeColor,
    getVisitStyle(0).strokeColor,
  ];
}

function buildVisitStrokeOpacityExpression(
  selectedDongCode: string | null,
  topStatDongCodes: string[],
  visitCountBuckets: VisitCountBuckets
) {
  return [
    "case",
    ["==", ["get", "emd_code"], selectedDongCode ?? ""],
    getSelectedDongStyle().strokeOpacity,
    ["in", ["get", "emd_code"], ["literal", topStatDongCodes]],
    getTopStatDongStyle().strokeOpacity,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.sevenPlus]],
    getVisitStyle(7).strokeOpacity,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.fourToSix]],
    getVisitStyle(4).strokeOpacity,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.twoToThree]],
    getVisitStyle(2).strokeOpacity,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.one]],
    getVisitStyle(1).strokeOpacity,
    getVisitStyle(0).strokeOpacity,
  ];
}

function buildVisitStrokeWidthExpression(
  selectedDongCode: string | null,
  topStatDongCodes: string[],
  visitCountBuckets: VisitCountBuckets
) {
  return [
    "case",
    ["==", ["get", "emd_code"], selectedDongCode ?? ""],
    getSelectedDongStyle().strokeWeight,
    ["in", ["get", "emd_code"], ["literal", topStatDongCodes]],
    getTopStatDongStyle().strokeWeight,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.sevenPlus]],
    getVisitStyle(7).strokeWeight,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.fourToSix]],
    getVisitStyle(4).strokeWeight,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.twoToThree]],
    getVisitStyle(2).strokeWeight,
    ["in", ["get", "emd_code"], ["literal", visitCountBuckets.one]],
    getVisitStyle(1).strokeWeight,
    getVisitStyle(0).strokeWeight,
  ];
}

function getDebugBoundaryFillPaint() {
  return {
    "fill-color": "#ff0000",
    "fill-opacity": 0.75,
  };
}

function getDebugBoundaryLinePaint() {
  return {
    "line-color": "#000000",
    "line-opacity": 1,
    "line-width": 4,
  };
}

function getVectorLayerId(metadata: unknown) {
  const vectorLayers = (metadata as { vector_layers?: Array<{ id?: string }> })?.vector_layers;

  return vectorLayers?.find((layer) => layer.id)?.id ?? null;
}

function getBoundsFromPmtilesMetadata(metadata: unknown) {
  const bounds = (metadata as { bounds?: string })?.bounds;

  if (!bounds) {
    return null;
  }

  const values = bounds.split(",").map((value) => Number(value.trim()));

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [west, south, east, north] = values;

  return [
    [west, south],
    [east, north],
  ] as [[number, number], [number, number]];
}

function naverZoomToMapLibreZoom(naverZoom: number, offset: number) {
  return naverZoom + offset;
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
  const naverMapElementRef = useRef<HTMLDivElement>(null);
  const overlayMapElementRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoPreviewUrlRef = useRef<string | null>(null);
  const mapInitializedRef = useRef(false);
  const naverMapRef = useRef<NaverMapInstance | null>(null);
  const mapLibreMapRef = useRef<MapLibreMap | null>(null);
  const mapLibreZoomOffsetRef = useRef(DEFAULT_MAPLIBRE_ZOOM_OFFSET);
  const mapSyncRafRef = useRef<number | null>(null);
  const isMapMovingRef = useRef(false);
  const isMapZoomingRef = useRef(false);
  const lastSyncReasonRef = useRef<string | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOverlaySizeRef = useRef<{ width: number; height: number } | null>(null);
  const lastSyncLogAtRef = useRef(0);
  const rerunHitTestRef = useRef<(() => void) | null>(null);
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
  const [photoCompressionMessage, setPhotoCompressionMessage] = useState<string | null>(null);
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

  const updateBoundaryLayerStyles = useCallback(() => {
    const map = mapLibreMapRef.current;

    if (!map?.getLayer(EUPMYEONDONG_FILL_LAYER_ID) || !map.getLayer(EUPMYEONDONG_LINE_LAYER_ID)) {
      return;
    }

    if (DEBUG_BOUNDARY_STYLE) {
      map.setPaintProperty(
        EUPMYEONDONG_FILL_LAYER_ID,
        "fill-color",
        getDebugBoundaryFillPaint()["fill-color"]
      );
      map.setPaintProperty(
        EUPMYEONDONG_FILL_LAYER_ID,
        "fill-opacity",
        getDebugBoundaryFillPaint()["fill-opacity"]
      );
      map.setPaintProperty(
        EUPMYEONDONG_LINE_LAYER_ID,
        "line-color",
        getDebugBoundaryLinePaint()["line-color"]
      );
      map.setPaintProperty(
        EUPMYEONDONG_LINE_LAYER_ID,
        "line-opacity",
        getDebugBoundaryLinePaint()["line-opacity"]
      );
      map.setPaintProperty(
        EUPMYEONDONG_LINE_LAYER_ID,
        "line-width",
        getDebugBoundaryLinePaint()["line-width"]
      );
      return;
    }

    const visitCountBuckets = getVisitCountBuckets(visitCountByDongRef.current);
    const topStatDongCodes = [...topStatDongCodesRef.current];
    const selectedDongCode = selectedDongCodeRef.current;

    map.setPaintProperty(
      EUPMYEONDONG_FILL_LAYER_ID,
      "fill-color",
      buildVisitFillExpression(selectedDongCode, topStatDongCodes, visitCountBuckets)
    );
    map.setPaintProperty(
      EUPMYEONDONG_FILL_LAYER_ID,
      "fill-opacity",
      buildVisitOpacityExpression(selectedDongCode, topStatDongCodes, visitCountBuckets)
    );
    map.setPaintProperty(
      EUPMYEONDONG_LINE_LAYER_ID,
      "line-color",
      buildVisitStrokeExpression(selectedDongCode, topStatDongCodes, visitCountBuckets)
    );
    map.setPaintProperty(
      EUPMYEONDONG_LINE_LAYER_ID,
      "line-opacity",
      buildVisitStrokeOpacityExpression(selectedDongCode, topStatDongCodes, visitCountBuckets)
    );
    map.setPaintProperty(
      EUPMYEONDONG_LINE_LAYER_ID,
      "line-width",
      buildVisitStrokeWidthExpression(selectedDongCode, topStatDongCodes, visitCountBuckets)
    );
  }, []);

  const restyleDong = useCallback(() => {
    updateBoundaryLayerStyles();
  }, [updateBoundaryLayerStyles]);

  const clearClickPulse = useCallback(() => {
    restyleDong();
  }, [restyleDong]);

  function setHoverLabel(name: string | null) {
    setHoveredDongName(name);
  }

  const resetUserScopedMapState = useCallback(() => {
    visitCountByDongRef.current.clear();
    dongNameByCodeRef.current.clear();
    topStatDongCodesRef.current.clear();
    selectedDongCodeRef.current = null;
    updateBoundaryLayerStyles();

    setVisitStats({
      visitedDongCount: 0,
      totalVisitCount: 0,
      topDongName: null,
      topVisitCount: 0,
    });
  }, [updateBoundaryLayerStyles]);

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
    setPhotoCompressionMessage(null);
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
      setStatusMessage("일상 기록을 불러오지 못했습니다.");
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
      setStatusMessage("기록 기반 횟수를 불러오지 못했습니다.");
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

    updateBoundaryLayerStyles();
  }, [resetUserScopedMapState, updateBoundaryLayerStyles]);

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
          setStatusMessage("전체 일상 기록을 불러오지 못했습니다.");
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

        setStatusMessage("지역 기록을 불러오지 못했습니다.");
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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let removeManualHitTest: (() => void) | null = null;
    let removeWindowResizeListener: (() => void) | null = null;
    let removeMapGestureGuards: (() => void) | null = null;

    function syncMapElementSizes() {
      const rootRect = mapRef.current?.getBoundingClientRect();

      if (!rootRect || !naverMapElementRef.current || !overlayMapElementRef.current) {
        return null;
      }

      naverMapElementRef.current.style.position = "absolute";
      naverMapElementRef.current.style.inset = "0";
      naverMapElementRef.current.style.zIndex = "0";
      naverMapElementRef.current.style.width = `${rootRect.width}px`;
      naverMapElementRef.current.style.height = `${rootRect.height}px`;

      overlayMapElementRef.current.style.position = "absolute";
      overlayMapElementRef.current.style.inset = "0";
      overlayMapElementRef.current.style.zIndex = "20";
      overlayMapElementRef.current.style.background = DEBUG_OVERLAY_BACKGROUND
        ? "rgba(255, 0, 0, 0.08)"
        : "transparent";
      overlayMapElementRef.current.style.pointerEvents = "none";
      overlayMapElementRef.current.style.opacity = isMapMovingRef.current
        ? OVERLAY_MOVING_OPACITY
        : OVERLAY_IDLE_OPACITY;
      overlayMapElementRef.current.style.transition = "opacity 120ms ease-out";
      overlayMapElementRef.current.style.visibility = "visible";
      overlayMapElementRef.current.style.width = `${rootRect.width}px`;
      overlayMapElementRef.current.style.height = `${rootRect.height}px`;

      const naverRect = naverMapElementRef.current.getBoundingClientRect();
      const overlayRect = overlayMapElementRef.current.getBoundingClientRect();
      const sizeMismatch =
        Math.abs(naverRect.width - overlayRect.width) > 1 ||
        Math.abs(naverRect.height - overlayRect.height) > 1;

      if (sizeMismatch) {
        overlayMapElementRef.current.style.width = `${naverRect.width}px`;
        overlayMapElementRef.current.style.height = `${naverRect.height}px`;
        console.warn("[MapSync] overlay size adjusted to Naver container", {
          naverRect,
          overlayRect,
        });
      }

      return rootRect;
    }

    function forceMapLibreDomVisible(map: MapLibreMap) {
      const elements = [map.getContainer(), map.getCanvasContainer(), map.getCanvas()];

      elements.forEach((element) => {
        element.style.background = "transparent";
        element.style.opacity = "1";
        element.style.pointerEvents = "none";
        element.style.visibility = "visible";
      });
    }

    function setOverlayTransitionState(isMoving: boolean) {
      isMapMovingRef.current = isMoving;

      if (!overlayMapElementRef.current) {
        return;
      }

      overlayMapElementRef.current.style.transition = "opacity 120ms ease-out";
      overlayMapElementRef.current.style.opacity = isMoving
        ? OVERLAY_MOVING_OPACITY
        : OVERLAY_IDLE_OPACITY;
    }

    function resizeOverlayIfNeeded(map: MapLibreMap) {
      const rect = overlayMapElementRef.current?.getBoundingClientRect();

      if (!rect) {
        return false;
      }

      const previous = lastOverlaySizeRef.current;
      const didSizeChange =
        !previous ||
        Math.abs(previous.width - rect.width) > 1 ||
        Math.abs(previous.height - rect.height) > 1;

      if (didSizeChange) {
        map.resize();
        lastOverlaySizeRef.current = { width: rect.width, height: rect.height };
      }

      return didSizeChange;
    }

    function installMapGestureGuards() {
      const element = mapRef.current;

      if (!element || removeMapGestureGuards) {
        return;
      }

      const stopBrowserZoomGesture = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
        }
      };
      const stopSafariGesture = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
      };

      element.addEventListener("wheel", stopBrowserZoomGesture, { capture: true, passive: false });
      element.addEventListener("gesturestart", stopSafariGesture, { passive: false });
      element.addEventListener("gesturechange", stopSafariGesture, { passive: false });

      removeMapGestureGuards = () => {
        element.removeEventListener("wheel", stopBrowserZoomGesture, { capture: true });
        element.removeEventListener("gesturestart", stopSafariGesture);
        element.removeEventListener("gesturechange", stopSafariGesture);
      };
    }

    function logOverlayStacking(label: string, map: MapLibreMap) {
      if (!overlayMapElementRef.current || !naverMapElementRef.current) {
        return;
      }

      const overlayStyle = getComputedStyle(overlayMapElementRef.current);
      const naverStyle = getComputedStyle(naverMapElementRef.current);
      const canvas = map.getCanvas();
      const canvasStyle = getComputedStyle(canvas);

      console.info(label, {
        overlay: {
          rect: overlayMapElementRef.current.getBoundingClientRect(),
          zIndex: overlayStyle.zIndex,
          opacity: overlayStyle.opacity,
          visibility: overlayStyle.visibility,
          pointerEvents: overlayStyle.pointerEvents,
        },
        naver: {
          rect: naverMapElementRef.current.getBoundingClientRect(),
          zIndex: naverStyle.zIndex,
          opacity: naverStyle.opacity,
          visibility: naverStyle.visibility,
          pointerEvents: naverStyle.pointerEvents,
        },
        canvas: {
          rect: canvas.getBoundingClientRect(),
          zIndex: canvasStyle.zIndex,
          opacity: canvasStyle.opacity,
          visibility: canvasStyle.visibility,
          pointerEvents: canvasStyle.pointerEvents,
        },
      });
    }

    async function initializeVectorTileOverlay() {
      if (mapInitializedRef.current) {
        return;
      }

      const naver = (window as NaverWindow).naver;
      if (!naver?.maps || !naverMapElementRef.current || !overlayMapElementRef.current) {
        if (!naver?.maps) {
          console.warn("[NaverMap] naver.maps is missing");
          setStatusMessage("네이버 지도 API를 불러오지 못했습니다.");
        }
        if (!cancelled) {
          retryTimer = setTimeout(initializeVectorTileOverlay, 100);
        }
        return;
      }

      const naverApi = naver;
      installMapGestureGuards();
      const rootRect = syncMapElementSizes();
      const naverContainerRect = naverMapElementRef.current.getBoundingClientRect();

      console.info("[NaverMap] container rect", {
        rootWidth: rootRect?.width,
        rootHeight: rootRect?.height,
        width: naverContainerRect.width,
        height: naverContainerRect.height,
      });

      if (naverContainerRect.width <= 0 || naverContainerRect.height <= 0) {
        console.warn("[NaverMap] container has no size; retrying map initialization.");
        if (!cancelled) {
          retryTimer = setTimeout(initializeVectorTileOverlay, 100);
        }
        return;
      }

      mapInitializedRef.current = true;

      try {
        const [{ default: maplibregl }, { PMTiles, Protocol }] = await Promise.all([
          import("maplibre-gl"),
          import("pmtiles"),
        ]);

        if (cancelled || !naverMapElementRef.current || !overlayMapElementRef.current) {
          return;
        }

        if (!isPmtilesProtocolRegistered) {
          const protocol = new Protocol();
          try {
            maplibregl.addProtocol("pmtiles", protocol.tile);
          } catch (error) {
            console.warn("PMTiles protocol registration skipped.", error);
          }
          isPmtilesProtocolRegistered = true;
        }

        const naverMap = new naverApi.maps.Map(naverMapElementRef.current, {
          center: new naverApi.maps.LatLng(KOREA_CENTER[1], KOREA_CENTER[0]),
          zoom: NAVER_INITIAL_ZOOM,
          scrollWheel: true,
          draggable: true,
          disableDoubleClickZoom: false,
          pinchZoom: true,
        });
        naverMapRef.current = naverMap;

        console.info("[NaverMap] created", {
          center: naverMap.getCenter()?.toString?.(),
          zoom: naverMap.getZoom?.(),
          size: naverMap.getSize?.(),
        });

        naverApi.maps.Event.trigger(naverMap, "resize");
        window.setTimeout(() => {
          if (naverMapRef.current) {
            naverApi.maps.Event.trigger(naverMapRef.current, "resize");
          }
        }, 300);

        if (DEBUG_MAP_MODE === "naver-only") {
          console.info("[NaverMap] debug mode: naver-only");
          return;
        }

        const overlayMap = new maplibregl.Map({
          container: overlayMapElementRef.current,
          style: {
            version: 8,
            sources: {},
            layers: [],
          },
          center: KOREA_CENTER,
          zoom: naverZoomToMapLibreZoom(NAVER_INITIAL_ZOOM, mapLibreZoomOffsetRef.current),
          minZoom: 4,
          maxZoom: 16,
          interactive: true,
          attributionControl: false,
          canvasContextAttributes: { alpha: true },
        });

        mapLibreMapRef.current = overlayMap;
        syncMapElementSizes();
        forceMapLibreDomVisible(overlayMap);
        overlayMap.dragPan.disable();
        overlayMap.scrollZoom.disable();
        overlayMap.boxZoom.disable();
        overlayMap.keyboard.disable();
        overlayMap.doubleClickZoom.disable();
        overlayMap.touchZoomRotate.disable();
        console.info("[Overlay] rect", overlayMapElementRef.current.getBoundingClientRect());
        console.info("[MapLibre] canvas", overlayMap.getCanvas().getBoundingClientRect());
        logOverlayStacking("[MapLibre canvas style]", overlayMap);
        overlayMap.resize();
        window.setTimeout(() => {
          forceMapLibreDomVisible(overlayMap);
          overlayMap.resize();
          console.info("[MapLibre] canvas after resize", overlayMap.getCanvas().getBoundingClientRect());
          logOverlayStacking("[MapLibre canvas style after resize]", overlayMap);
        }, 300);

        function syncOverlayToNaverMap(reason = "manual", mode: "live" | "final" = "final") {
          if (!mapLibreMapRef.current || !naverMapRef.current) {
            return;
          }

          const sizeRect = syncMapElementSizes();
          const center = naverMapRef.current.getCenter();
          const lat = center.lat();
          const lng = center.lng();
          const naverCenter: [number, number] = [lng, lat];
          const naverZoom = naverMapRef.current.getZoom();
          const offset = mapLibreZoomOffsetRef.current;
          const mapLibreZoom = naverZoomToMapLibreZoom(naverZoom, offset);

          resizeOverlayIfNeeded(mapLibreMapRef.current);

          const camera = {
            center: DEBUG_FIXED_OVERLAY_VIEW ? [126.978, 37.5665] : naverCenter,
            zoom: DEBUG_FIXED_OVERLAY_VIEW ? 10 : mapLibreZoom,
          } satisfies { center: [number, number]; zoom: number };

          if (mode === "live") {
            mapLibreMapRef.current.easeTo({
              ...camera,
              duration: 80,
              easing: (time) => time,
            });
          } else {
            mapLibreMapRef.current.stop();
            mapLibreMapRef.current.jumpTo(camera);
          }

          lastSyncReasonRef.current = reason;

          if (DEBUG_MAP_SYNC) {
            const now = performance.now();

            if (now - lastSyncLogAtRef.current > 250 || mode === "final") {
              lastSyncLogAtRef.current = now;
              console.info("[MapSync]", {
                reason,
                mode,
                naverCenter: { lat, lng },
                naverZoom,
                mapLibreZoom,
                offset,
                isMoving: isMapMovingRef.current,
                isZooming: isMapZoomingRef.current,
                overlayOpacity: overlayMapElementRef.current?.style.opacity,
                naverSize: naverMapRef.current.getSize?.(),
                naverRect: naverMapElementRef.current?.getBoundingClientRect(),
                overlaySize: sizeRect
                  ? { width: sizeRect.width, height: sizeRect.height }
                  : overlayMapElementRef.current?.getBoundingClientRect(),
                maplibreCenter: mapLibreMapRef.current.getCenter().toArray(),
                maplibreZoom: mapLibreMapRef.current.getZoom(),
              });
            }
          }
        }

        function scheduleOverlaySync(reason: string, mode: "live" | "final" = "live") {
          if (mapSyncRafRef.current !== null) {
            if (mode !== "final") {
              return;
            }

            window.cancelAnimationFrame(mapSyncRafRef.current);
            mapSyncRafRef.current = null;
          }

          mapSyncRafRef.current = window.requestAnimationFrame(() => {
            mapSyncRafRef.current = null;
            syncOverlayToNaverMap(reason, mode);

            if (mode === "final") {
              setOverlayTransitionState(false);
              isMapZoomingRef.current = false;
              window.setTimeout(() => {
                rerunHitTestRef.current?.();
              }, 30);
            }
          });
        }

        ["zoom_changed", "bounds_changed", "dragstart", "drag"].forEach((eventName) => {
          naverApi.maps.Event.addListener(naverMap, eventName, () => {
            if (idleTimeoutRef.current) {
              clearTimeout(idleTimeoutRef.current);
              idleTimeoutRef.current = null;
            }
            setOverlayTransitionState(true);
            isMapZoomingRef.current = eventName === "zoom_changed";
            setHoverLabel(null);
            scheduleOverlaySync(eventName, "live");
          });
        });
        ["dragend", "resize"].forEach((eventName) => {
          naverApi.maps.Event.addListener(naverMap, eventName, () => {
            scheduleOverlaySync(eventName, "live");
          });
        });
        naverApi.maps.Event.addListener(naverMap, "idle", () => {
          if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current);
          }

          idleTimeoutRef.current = setTimeout(() => {
            idleTimeoutRef.current = null;
            scheduleOverlaySync("idle", "final");
          }, 70);
        });

        (window as NaverWindow).__setOverlayZoomOffset = (offset: number) => {
          if (!Number.isFinite(offset)) {
            console.warn("[MapSync] invalid overlay zoom offset", offset);
            return;
          }

          mapLibreZoomOffsetRef.current = offset;
          console.info("[MapSync] overlay zoom offset updated", { offset });
          syncOverlayToNaverMap("console-offset", "final");
        };

        const handleWindowResize = () => scheduleOverlaySync("window-resize", "final");
        window.addEventListener("resize", handleWindowResize);
        removeWindowResizeListener = () => {
          window.removeEventListener("resize", handleWindowResize);
        };
        if (mapRef.current) {
          resizeObserver = new ResizeObserver(() => {
            syncMapElementSizes();
            if (naverMapRef.current) {
              naverApi.maps.Event.trigger(naverMapRef.current, "resize");
            }
            if (mapLibreMapRef.current) {
              resizeOverlayIfNeeded(mapLibreMapRef.current);
            }
            scheduleOverlaySync("resize-observer", "final");
          });
          resizeObserver.observe(mapRef.current);
        }
        syncOverlayToNaverMap("initial", "final");

        overlayMap.on("load", async () => {
          if (cancelled) {
            return;
          }

          let boundarySourceLayer = EUPMYEONDONG_SOURCE_LAYER;
          let metadataBounds: [[number, number], [number, number]] | null = null;

          try {
            const tileCheck = await fetch(EUPMYEONDONG_PMTILES_PATH, { method: "HEAD" });

            if (!tileCheck.ok) {
              console.warn("PMTiles file is missing or unavailable.", {
                path: EUPMYEONDONG_PMTILES_PATH,
                status: tileCheck.status,
                statusText: tileCheck.statusText,
              });
              setStatusMessage("전국 지도 타일 파일을 불러오지 못했습니다. public/tiles/eupmyeondong.pmtiles 파일을 확인해 주세요.");
              return;
            }

            const pmtiles = new PMTiles(EUPMYEONDONG_PMTILES_PATH);
            const header = await pmtiles.getHeader();
            const metadata = await pmtiles.getMetadata();
            const metadataLayerId = getVectorLayerId(metadata);
            metadataBounds = getBoundsFromPmtilesMetadata(metadata);

            console.info("[PMTiles] header", header);
            console.info("[PMTiles] metadata", metadata);
            console.info("[PMTiles] parsed bounds", metadataBounds);

            if (metadataLayerId && metadataLayerId !== EUPMYEONDONG_SOURCE_LAYER) {
              console.warn("[PMTiles] source-layer mismatch; using metadata layer id.", {
                configured: EUPMYEONDONG_SOURCE_LAYER,
                actual: metadataLayerId,
              });
              boundarySourceLayer = metadataLayerId;
            }
          } catch (error) {
            console.warn("PMTiles availability check failed.", error);
            setStatusMessage("전국 지도 타일 파일을 불러오지 못했습니다. public/tiles/eupmyeondong.pmtiles 파일을 확인해 주세요.");
            return;
          }

          let hasLoggedSourceData = false;
          let hasLoggedIdle = false;

          overlayMap.on(
            "sourcedata",
            (event: { sourceId?: string; isSourceLoaded?: boolean; sourceDataType?: string }) => {
              if (event.sourceId !== EUPMYEONDONG_SOURCE_ID || hasLoggedSourceData) {
                return;
              }

              hasLoggedSourceData = true;
              console.info("[MapLibre] sourcedata", {
                sourceId: event.sourceId,
                isSourceLoaded: event.isSourceLoaded,
                sourceDataType: event.sourceDataType,
              });
            }
          );

          overlayMap.on("idle", () => {
            if (hasLoggedIdle) {
              return;
            }

            hasLoggedIdle = true;
            const renderedFeatures = overlayMap.queryRenderedFeatures({
              layers: [EUPMYEONDONG_FILL_LAYER_ID],
            });
            const sourceFeatures = overlayMap.querySourceFeatures(EUPMYEONDONG_SOURCE_ID, {
              sourceLayer: boundarySourceLayer,
            });
            console.info("[MapLibre] idle", {
              zoom: overlayMap.getZoom(),
              center: overlayMap.getCenter().toArray(),
              sourceLoaded: overlayMap.isSourceLoaded(EUPMYEONDONG_SOURCE_ID),
              renderedFeatures: renderedFeatures.length,
              sourceFeatures: sourceFeatures.length,
            });
          });

          overlayMap.addSource(EUPMYEONDONG_SOURCE_ID, {
            type: "vector",
            url: `pmtiles://${EUPMYEONDONG_PMTILES_PATH}`,
            minzoom: 0,
            maxzoom: 5,
            attribution: "NGII eupmyeondong boundaries",
          });

          overlayMap.addLayer({
            id: EUPMYEONDONG_FILL_LAYER_ID,
            type: "fill",
            source: EUPMYEONDONG_SOURCE_ID,
            "source-layer": boundarySourceLayer,
            minzoom: 0,
            maxzoom: 22,
            paint: DEBUG_BOUNDARY_STYLE
              ? getDebugBoundaryFillPaint()
              : {
                  "fill-color": getVisitStyle(0).fillColor,
                  "fill-opacity": getVisitStyle(0).fillOpacity,
                },
          });

          overlayMap.addLayer({
            id: EUPMYEONDONG_LINE_LAYER_ID,
            type: "line",
            source: EUPMYEONDONG_SOURCE_ID,
            "source-layer": boundarySourceLayer,
            minzoom: 0,
            maxzoom: 22,
            paint: DEBUG_BOUNDARY_STYLE
              ? getDebugBoundaryLinePaint()
              : {
                  "line-color": getVisitStyle(0).strokeColor,
                  "line-opacity": getVisitStyle(0).strokeOpacity,
                  "line-width": getVisitStyle(0).strokeWeight,
                },
          });

          setTotalDongCount(NATIONAL_EUPMYEONDONG_COUNT);
          forceMapLibreDomVisible(overlayMap);
          overlayMap.resize();
          updateBoundaryLayerStyles();
          console.info("[MapLibre paint]", {
            fillLayer: overlayMap.getLayer(EUPMYEONDONG_FILL_LAYER_ID),
            lineLayer: overlayMap.getLayer(EUPMYEONDONG_LINE_LAYER_ID),
            fillColor: overlayMap.getPaintProperty(EUPMYEONDONG_FILL_LAYER_ID, "fill-color"),
            fillOpacity: overlayMap.getPaintProperty(EUPMYEONDONG_FILL_LAYER_ID, "fill-opacity"),
            lineColor: overlayMap.getPaintProperty(EUPMYEONDONG_LINE_LAYER_ID, "line-color"),
            lineOpacity: overlayMap.getPaintProperty(EUPMYEONDONG_LINE_LAYER_ID, "line-opacity"),
            lineWidth: overlayMap.getPaintProperty(EUPMYEONDONG_LINE_LAYER_ID, "line-width"),
          });
          logOverlayStacking("[MapLibre canvas style after layers]", overlayMap);
          window.setTimeout(() => {
            forceMapLibreDomVisible(overlayMap);
            overlayMap.resize();
          }, 300);
          window.setTimeout(() => {
            const renderedFeatures = overlayMap.queryRenderedFeatures({
              layers: [EUPMYEONDONG_FILL_LAYER_ID],
            });
            const sourceFeatures = overlayMap.querySourceFeatures(EUPMYEONDONG_SOURCE_ID, {
              sourceLayer: boundarySourceLayer,
            });

            console.info("[MapLibre] feature check", {
              renderedFeatures: renderedFeatures.length,
              sourceFeatures: sourceFeatures.length,
              zoom: overlayMap.getZoom(),
              center: overlayMap.getCenter().toArray(),
              bounds: overlayMap.getBounds().toArray(),
            });
          }, 1000);

          if (DEBUG_FIXED_OVERLAY_VIEW) {
            overlayMap.jumpTo({ center: [126.978, 37.5665], zoom: 10 });
          } else if (metadataBounds && DEBUG_BOUNDARY_STYLE) {
            overlayMap.fitBounds(metadataBounds, { duration: 0, padding: 20 });
          }

          console.info("PMTiles overlay layer initialized on Naver map.", {
            path: EUPMYEONDONG_PMTILES_PATH,
            sourceId: EUPMYEONDONG_SOURCE_ID,
            sourceLayer: boundarySourceLayer,
            expectedFeatureCount: NATIONAL_EUPMYEONDONG_COUNT,
            visitedCodes: visitCountByDongRef.current.size,
            debugBoundaryStyle: DEBUG_BOUNDARY_STYLE,
            debugFixedOverlayView: DEBUG_FIXED_OVERLAY_VIEW,
          });

          if (mapRef.current && overlayMapElementRef.current) {
            let lastManualHitLogTime = 0;
            let hitTestRaf: number | null = null;
            let pendingMousePoint: [number, number] | null = null;
            let lastMousePoint: [number, number] | null = null;
            const manualHitTestElement = mapRef.current;

            const getFeatureAtPoint = (point: [number, number]) => {
              if (
                isMapMovingRef.current ||
                !overlayMap.getLayer(EUPMYEONDONG_FILL_LAYER_ID) ||
                !overlayMap.isStyleLoaded()
              ) {
                return null;
              }

              const features = overlayMap.queryRenderedFeatures(point, {
                layers: [EUPMYEONDONG_FILL_LAYER_ID],
              });

              return features[0] ?? null;
            };

            const getPointFromMouseEvent = (event: MouseEvent): [number, number] | null => {
              const rect = overlayMapElementRef.current?.getBoundingClientRect();

              if (!rect) {
                return null;
              }

              return [event.clientX - rect.left, event.clientY - rect.top];
            };

            const selectBoundaryFeature = (feature: unknown) => {
              const properties = getBoundaryFeatureProperties(feature as BoundaryFeature);

              if (!properties) {
                return;
              }

              const currentUser = authUserRef.current;
              const selectedMap = currentMapRef.current;

              if (!currentUser) {
                setStatusMessage("로그인하면 개인 기록을 남길 수 있습니다.");
                return;
              }

              if (!selectedMap) {
                setStatusMessage("먼저 사용할 지도를 선택하거나 새 지도를 만들어 주세요.");
                return;
              }

              const { dongCode, dongName, regionLabel, sigCode } = properties;
              const currentVisitCount = visitCountByDongRef.current.get(dongCode) ?? 0;
              selectedDongCodeRef.current = dongCode;
              setSelectedDong({ dongCode, dongName, regionLabel, sigCode, visitCount: currentVisitCount });
              setIsDongPanelOpen(true);
              setIsDrawerOpen(false);
              updateBoundaryLayerStyles();

              if (clickPulseTimerRef.current) {
                clearTimeout(clickPulseTimerRef.current);
              }

              clickPulseTimerRef.current = setTimeout(() => {
                clearClickPulse();
              }, 380);
            };

            const runMouseMoveHitTest = () => {
              hitTestRaf = null;

              if (!pendingMousePoint) {
                return;
              }

              const feature = getFeatureAtPoint(pendingMousePoint);
              const properties = getBoundaryFeatureProperties(feature as BoundaryFeature);
              const now = Date.now();

              setHoverLabel(properties?.regionLabel ?? null);
              manualHitTestElement.style.cursor = properties ? "pointer" : "";

              if (DEBUG_REGION_LABEL && now - lastManualHitLogTime >= 500) {
                lastManualHitLogTime = now;
                console.info("[Manual hit test]", {
                  count: feature ? 1 : 0,
                  label: properties?.regionLabel,
                  properties: feature?.properties,
                });
              }
            };

            const handleManualMouseMove = (event: MouseEvent) => {
              const point = getPointFromMouseEvent(event);

              if (!point) {
                return;
              }

              pendingMousePoint = point;
              lastMousePoint = point;

              if (hitTestRaf !== null) {
                return;
              }

              hitTestRaf = window.requestAnimationFrame(runMouseMoveHitTest);
            };

            const handleManualMouseLeave = () => {
              pendingMousePoint = null;
              lastMousePoint = null;
              setHoverLabel(null);
              manualHitTestElement.style.cursor = "";
            };

            const handleManualClick = (event: MouseEvent) => {
              const point = getPointFromMouseEvent(event);
              const feature = point ? getFeatureAtPoint(point) : null;

              if (DEBUG_REGION_LABEL) {
                console.info("[Boundary click]", feature?.properties);
              }
              selectBoundaryFeature(feature);
            };

            rerunHitTestRef.current = () => {
              if (!lastMousePoint) {
                return;
              }

              pendingMousePoint = lastMousePoint;
              runMouseMoveHitTest();
            };

            manualHitTestElement.addEventListener("mousemove", handleManualMouseMove, {
              capture: true,
            });
            manualHitTestElement.addEventListener("mouseleave", handleManualMouseLeave);
            manualHitTestElement.addEventListener("click", handleManualClick, { capture: true });
            removeManualHitTest = () => {
              if (hitTestRaf !== null) {
                window.cancelAnimationFrame(hitTestRaf);
              }
              manualHitTestElement.removeEventListener("mousemove", handleManualMouseMove, {
                capture: true,
              });
              manualHitTestElement.removeEventListener("mouseleave", handleManualMouseLeave);
              manualHitTestElement.removeEventListener("click", handleManualClick, {
                capture: true,
              });
              rerunHitTestRef.current = null;
            };
          }

          overlayMap.on("mousemove", EUPMYEONDONG_FILL_LAYER_ID, (event: MapLayerMouseEvent) => {
            console.info("[Boundary hover]", event.features?.[0]?.properties);
            const properties = getBoundaryFeatureProperties(event.features?.[0] as BoundaryFeature);
            setHoverLabel(properties?.regionLabel ?? null);
            overlayMap.getCanvas().style.cursor = properties ? "pointer" : "";
          });

          overlayMap.on("mouseleave", EUPMYEONDONG_FILL_LAYER_ID, () => {
            setHoverLabel(null);
            overlayMap.getCanvas().style.cursor = "";
          });

          overlayMap.on("click", EUPMYEONDONG_FILL_LAYER_ID, (event: MapLayerMouseEvent) => {
            if (DEBUG_REGION_LABEL) {
              console.info("[Boundary click]", event.features?.[0]?.properties);
            }
            const properties = getBoundaryFeatureProperties(event.features?.[0] as BoundaryFeature);

            if (!properties) {
              return;
            }

            const currentUser = authUserRef.current;
            const selectedMap = currentMapRef.current;

            if (!currentUser) {
              setStatusMessage("로그인하면 개인 기록을 남길 수 있습니다.");
              return;
            }

            if (!selectedMap) {
              setStatusMessage("먼저 사용할 지도를 선택하거나 새 지도를 만들어 주세요.");
              return;
            }

            const { dongCode, dongName, regionLabel, sigCode } = properties;
            const currentVisitCount = visitCountByDongRef.current.get(dongCode) ?? 0;
            selectedDongCodeRef.current = dongCode;
            setSelectedDong({ dongCode, dongName, regionLabel, sigCode, visitCount: currentVisitCount });
            setIsDongPanelOpen(true);
            setIsDrawerOpen(false);
            updateBoundaryLayerStyles();

            if (clickPulseTimerRef.current) {
              clearTimeout(clickPulseTimerRef.current);
            }

            clickPulseTimerRef.current = setTimeout(() => {
              clearClickPulse();
            }, 380);
          });
        });

        overlayMap.on("error", (event) => {
          console.warn("MapLibre overlay error.", event.error ?? event);
        });
      } catch (error) {
        console.warn("Naver map + PMTiles overlay initialization failed.", error);
        setStatusMessage("네이버 지도 위에 경계 레이어를 초기화하지 못했습니다.");
        mapInitializedRef.current = false;
      }
    }

    void initializeVectorTileOverlay();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (mapSyncRafRef.current !== null) {
        cancelAnimationFrame(mapSyncRafRef.current);
        mapSyncRafRef.current = null;
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      removeManualHitTest?.();
      removeManualHitTest = null;
      removeMapGestureGuards?.();
      removeMapGestureGuards = null;
      removeWindowResizeListener?.();
      removeWindowResizeListener = null;
      if ((window as NaverWindow).__setOverlayZoomOffset) {
        delete (window as NaverWindow).__setOverlayZoomOffset;
      }
      resizeObserver?.disconnect();
      mapLibreMapRef.current?.remove();
      mapLibreMapRef.current = null;
      naverMapRef.current = null;
      mapInitializedRef.current = false;
    };
  }, [clearClickPulse, updateBoundaryLayerStyles]);
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
      setStatusMessage("먼저 지도를 클릭해서 지역을 선택하세요.");
      return;
    }

    const trimmedContent = diaryContent.trim();
    if (!trimmedContent) {
      setStatusMessage("기록 내용을 입력하세요.");
      return;
    }

    setIsSavingDiary(true);
    setStatusMessage(null);

    try {
      let photoUrl = photoLink.trim() || null;

      if (photoFile) {
        setStatusMessage("이미지를 압축하는 중입니다...");
        const compressedImage = await compressImageBeforeUpload(photoFile);
        const uploadFile = compressedImage.file;
        const fileExtension =
          uploadFile.type === "image/png"
            ? "png"
            : uploadFile.type === "image/gif"
              ? "gif"
              : uploadFile.type === "image/webp"
                ? "webp"
                : "jpg";
        const filePath = `${currentMap.id}/${authUser.id}/${selectedDong.dongCode}/${crypto.randomUUID()}.${fileExtension}`;
        const compressionMessage = compressedImage.didCompress
          ? `압축 완료: ${formatBytes(compressedImage.originalSize)} → ${formatBytes(
              compressedImage.compressedSize
            )}`
          : `원본 사용: ${formatBytes(compressedImage.originalSize)}`;
        const uploadSizeWarning =
          compressedImage.compressedSize > 5 * 1024 * 1024
            ? " 압축 후에도 파일이 커서 업로드와 로딩이 느릴 수 있습니다."
            : "";

        console.info("[ImageCompression] upload prepared", {
          originalName: photoFile.name,
          originalSize: compressedImage.originalSize,
          compressedSize: compressedImage.compressedSize,
          width: compressedImage.width,
          height: compressedImage.height,
          mimeType: compressedImage.mimeType,
          didCompress: compressedImage.didCompress,
        });

        setPhotoCompressionMessage(`${compressionMessage}.${uploadSizeWarning}`);
        setStatusMessage(`${compressionMessage}.${uploadSizeWarning} 사진을 업로드하는 중입니다...`);

        const { error: uploadError } = await supabase.storage
          .from("dong-diary-photos")
          .upload(filePath, uploadFile, {
            cacheControl: "3600",
            contentType: uploadFile.type,
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
            regionLabel: selectedDong!.regionLabel,
            sigCode: selectedDong!.sigCode,
            visitCount: nextVisitCount,
          });
          restyleDong();
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

            updateBoundaryLayerStyles();

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

      setStatusMessage("지역 기록과 사진이 저장되었습니다.");

      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to save diary:", error);
      if (error instanceof ImageCompressionError) {
        setStatusMessage(error.message);
        return;
      }
      setStatusMessage("기록 저장에 실패했습니다. 잠시 후 다시 시도하세요.");
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
    setPhotoCompressionMessage(null);

    if (!nextFile) {
      setPhotoPreviewUrl(null);
      return;
    }

    const fileName = nextFile.name.toLowerCase();
    const isHeicLike =
      nextFile.type === "image/heic" ||
      nextFile.type === "image/heif" ||
      fileName.endsWith(".heic") ||
      fileName.endsWith(".heif");

    if (isHeicLike) {
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      setStatusMessage("HEIC 이미지는 브라우저에서 변환이 제한될 수 있습니다. JPG 또는 PNG로 선택해 주세요.");
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
      return;
    }

    if (nextFile.size > 15 * 1024 * 1024) {
      setPhotoCompressionMessage(
        `원본 사진이 큽니다(${formatBytes(nextFile.size)}). 저장 전에 자동 압축합니다.`
      );
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
    setPhotoCompressionMessage(null);
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
      label: "기록한 지역",
      value: `${visitStats.visitedDongCount}개`,
      toneClassName: "border-sky-200 bg-sky-50 text-sky-700",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />
        </svg>
      ),
    },
    {
      label: "총 기록",
      value: `${visitStats.totalVisitCount}회`,
      toneClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M12 3 4 7v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V7l-8-4Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v7Z" />
        </svg>
      ),
    },
    {
      label: "가장 자주 기록한 지역",
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
  const mapTitle = currentMap?.title ?? (isLoadingMaps ? "지도 불러오는 중" : "전국 읍면동 일상 지도");
  const drawerTabs: { id: DrawerTab; label: string }[] = [
    { id: "map", label: "지도" },
    { id: "settings", label: "설정" },
    { id: "stats", label: "일상 통계" },
    { id: "status", label: "기록 현황" },
    { id: "records", label: "전체 일상 기록" },
    { id: "account", label: "계정" },
  ];
  const regionStatusItems = [
    ["기록 없음", getVisitStyle(0).fillColor, "아직 기록이 없는 읍면동입니다."],
    ["1회 기록", getVisitStyle(1).fillColor, "한 번 기록한 지역입니다."],
    ["2~3회 기록", getVisitStyle(2).fillColor, "여러 번 기록한 지역입니다."],
    ["4~6회 기록", getVisitStyle(4).fillColor, "자주 기록한 지역입니다."],
    ["7회 이상 기록", getVisitStyle(7).fillColor, "가장 진하게 표시되는 집중 기록 지역입니다."],
    ["기록 상위 지역", getTopStatDongStyle().fillColor, visitStats.topDongName ? `${visitStats.topDongName} · ${visitStats.topVisitCount}회` : "아직 상위 지역이 없습니다."],
    ["선택된 지역", getSelectedDongStyle().fillColor, selectedDong ? selectedDong.regionLabel : "아직 선택된 지역이 없습니다."],
  ] as const;
  const regionLegendItems = [
    ["기록 없음", getVisitStyle(0).fillColor, getVisitStyle(0).strokeColor],
    ["1회 기록", getVisitStyle(1).fillColor, getVisitStyle(1).strokeColor],
    ["2~3회 기록", getVisitStyle(2).fillColor, getVisitStyle(2).strokeColor],
    ["4~6회 기록", getVisitStyle(4).fillColor, getVisitStyle(4).strokeColor],
    ["7회 이상", getVisitStyle(7).fillColor, getVisitStyle(7).strokeColor],
    ["선택됨", getSelectedDongStyle().fillColor, getSelectedDongStyle().strokeColor],
  ] as const;
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
              Life Map Diary
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-base">
              {currentMap?.icon ? `${currentMap.icon} ` : ""}
              {mapTitle}
            </h1>
          </div>
          {selectedDong ? (
            <span className="hidden max-w-[180px] truncate rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 sm:block">
              {selectedDong.regionLabel}
            </span>
          ) : null}
        </div>
      </header>

      {isModalOpen && selectedDong ? (
        <div className="fixed left-0 top-0 z-50 flex h-full w-full items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{selectedDong.regionLabel}에 지역 기록 추가</h3>
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
                placeholder="이 지역에서 어떤 하루를 보냈는지 적어보세요."
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
              {photoCompressionMessage ? (
                <p className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
                  {photoCompressionMessage}
                </p>
              ) : null}

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
                    Life Map Diary
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
                      기록 지도 설정
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">
                      {currentMap?.icon ? `${currentMap.icon} ` : ""}
                      {currentMap?.title ?? "선택된 지도 없음"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {authUser
                        ? "기록 지도 생성, 정보 수정, 공유, 삭제를 이곳에서 관리합니다."
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
                      기록 비율
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{visitedRatio}%</p>
                    <p className="mt-1 text-sm text-slate-300">
                      전체 {totalDongCount}개 읍면동 중 {visitStats.visitedDongCount}개 지역 기록
                    </p>
                  </div>
                </div>
              ) : null}

              {activeDrawerTab === "status" ? (
                <div className="space-y-3">
                  {regionStatusItems.map(([label, color, detail]) => (
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
                      현재 지도 전체 일상 기록
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">
                      {currentMap?.title ?? "지도 없음"}
                    </h3>
                  </div>
                  {renderTimelineSortSelect()}
                  <input
                    value={recordSearch}
                    onChange={(event) => setRecordSearch(event.target.value)}
                    placeholder="읍면동명으로 검색"
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300"
                  />
                  {isLoadingAllDiaries ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-slate-300">
                      전체 일상 기록을 불러오는 중입니다.
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
        <div className="fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[55] px-3 lg:bottom-5 lg:left-auto lg:right-5 lg:w-[420px] lg:px-0">
          <section className="max-h-[72dvh] overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 text-white shadow-[0_28px_80px_rgba(15,23,42,0.36)]">
            <div className="border-b border-white/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">
                    선택된 지역
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{selectedDong.regionLabel}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    emd_code {selectedDong.dongCode}
                    {selectedDong.sigCode ? ` · sig_code ${selectedDong.sigCode}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">기록 {selectedDongVisitCount}회</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const dongCode = selectedDongCodeRef.current;
                    selectedDongCodeRef.current = null;
                    setIsDongPanelOpen(false);
                    setSelectedDong(null);
                    if (dongCode) {
                      restyleDong();
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
                    기록 추가
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
                  지역 기록을 불러오는 중입니다.
                </div>
              ) : diaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  아직 이 지역에 남긴 기록이 없습니다.
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

      <div className="fixed inset-0 mx-auto grid w-full max-w-[1600px] gap-4 px-0 pb-0 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:block">
        <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white/80 shadow-[0_30px_80px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="hidden flex-col gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-700 sm:text-xs sm:tracking-[0.28em]">
                Life Map Diary
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                {currentMap ? currentMap.title : "전국 읍면동 일상 지도"}
              </h1>
            </div>
            <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center xl:justify-end">
              <div className="inline-flex w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 shadow-sm sm:w-fit sm:px-3 sm:text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm sm:h-6 sm:w-6">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                    <path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />
                  </svg>
                </span>
                <span>기록 횟수 + 메모 + 사진</span>
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
            <div
              ref={mapRef}
              data-testid="map-viewport"
              className="map-interaction-surface relative h-full w-full overflow-hidden"
            >
              <div
                ref={naverMapElementRef}
                className={`absolute inset-0 z-0 ${DEBUG_MAP_MODE === "overlay-only" ? "opacity-0" : ""}`}
                style={{ height: "100%", inset: 0, position: "absolute", width: "100%", zIndex: 0 }}
              />
              <div
                ref={overlayMapElementRef}
                className={`maplibre-gl-transparent pointer-events-none absolute inset-0 z-20 ${
                  DEBUG_MAP_MODE === "naver-only" ? "hidden" : ""
                }`}
                style={{
                  background: DEBUG_OVERLAY_BACKGROUND ? "rgba(255, 0, 0, 0.08)" : "transparent",
                  height: "100%",
                  inset: 0,
                  opacity: 1,
                  pointerEvents: "none",
                  position: "absolute",
                  visibility: "visible",
                  width: "100%",
                  zIndex: 20,
                }}
              />
            </div>
            <div className="pointer-events-none absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 sm:left-4 sm:top-4 sm:max-w-[360px]">
              <div className="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-medium text-slate-800 shadow-lg backdrop-blur sm:px-4 sm:py-3 sm:text-sm">
                {hoveredDongName
                  ? `현재 보기: ${hoveredDongName}`
                  : selectedDong
                    ? `선택된 지역: ${selectedDong.regionLabel}`
                    : "지역을 선택하면 읍면동명이 표시됩니다."}
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
                  {regionLegendItems.map(([label, fillColor, strokeColor]) => (
                    <div key={label} className="flex items-center gap-1.5 text-[9px] text-slate-700 sm:gap-2 sm:text-xs">
                      <span
                        className="h-2 w-2 rounded-full border"
                        style={{ backgroundColor: fillColor, borderColor: strokeColor }}
                      />
                      {label}
                    </div>
                  ))}
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
              {currentMap.title} 지도를 삭제하면 연결된 일상 기록과 사진도 함께 삭제됩니다.
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
