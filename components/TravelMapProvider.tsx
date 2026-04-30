"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  MAP_SCHEMA_MISSING_MESSAGE,
  canEditMap,
  createTravelMap,
  fetchTravelMaps,
  isMissingMapSharingSchemaError,
  type TravelMap,
} from "@/lib/travelMaps";

type TravelMapContextValue = {
  authUser: User | null;
  maps: TravelMap[];
  currentMap: TravelMap | null;
  isLoadingMaps: boolean;
  mapError: string | null;
  canEditCurrentMap: boolean;
  selectMap: (mapId: string) => void;
  refreshMaps: () => Promise<void>;
  createMap: (title: string, description?: string) => Promise<TravelMap>;
};

const TravelMapContext = createContext<TravelMapContextValue | null>(null);

const SELECTED_MAP_STORAGE_KEY = "travel-map-diary:selected-map-id";
const DEFAULT_MAP_TITLE = "나의 여행 지도";

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const details = Object.getOwnPropertyNames(error).reduce<Record<string, unknown>>(
      (result, key) => ({
        ...result,
        [key]: (error as Record<string, unknown>)[key],
      }),
      {}
    );

    if (Object.keys(details).length > 0) {
      return JSON.stringify(details);
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function TravelMapProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [maps, setMaps] = useState<TravelMap[]>([]);
  const [currentMapId, setCurrentMapId] = useState<string | null>(null);
  const [isLoadingMaps, setIsLoadingMaps] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);

  const loadMaps = useCallback(async (user: User | null) => {
    if (!user) {
      setMaps([]);
      setCurrentMapId(null);
      setMapError(null);
      setIsLoadingMaps(false);
      return;
    }

    setIsLoadingMaps(true);
    setMapError(null);

    let nextMaps: TravelMap[] = [];

    try {
      nextMaps = await fetchTravelMaps();
    } catch (error) {
      if (isMissingMapSharingSchemaError(error)) {
        setMapError(MAP_SCHEMA_MISSING_MESSAGE);
      } else {
        console.error("Failed to load maps:", formatUnknownError(error));
        setMapError("지도 목록을 불러오지 못했습니다.");
      }

      setMaps([]);
      setCurrentMapId(null);
      setIsLoadingMaps(false);
      return;
    }

    if (nextMaps.length === 0) {
      try {
        const defaultMap = await createTravelMap(DEFAULT_MAP_TITLE);
        nextMaps = [defaultMap];
      } catch (error) {
        if (isMissingMapSharingSchemaError(error)) {
          setMapError(MAP_SCHEMA_MISSING_MESSAGE);
        } else {
          setMapError("아직 생성된 지도가 없습니다. 새 지도를 만들어 주세요.");
        }

        setMaps([]);
        setCurrentMapId(null);
        setIsLoadingMaps(false);
        return;
      }
    }

    setMaps(nextMaps);

    const savedMapId =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(SELECTED_MAP_STORAGE_KEY);
    const nextCurrentMap =
      nextMaps.find((map) => map.id === savedMapId) ??
      nextMaps.find((map) => map.role === "owner") ??
      nextMaps[0] ??
      null;

    setCurrentMapId(nextCurrentMap?.id ?? null);
    setIsLoadingMaps(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const { data } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      const currentUser = data.session?.user ?? null;
      setAuthUser(currentUser);
      await loadMaps(currentUser);
    }

    void initialize();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setAuthUser(currentUser);
      void loadMaps(currentUser);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [loadMaps]);

  const currentMap = useMemo(
    () => maps.find((map) => map.id === currentMapId) ?? null,
    [currentMapId, maps]
  );

  const selectMap = useCallback((mapId: string) => {
    setCurrentMapId(mapId);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SELECTED_MAP_STORAGE_KEY, mapId);
    }
  }, []);

  const refreshMaps = useCallback(async () => {
    await loadMaps(authUser);
  }, [authUser, loadMaps]);

  const createMap = useCallback(
    async (title: string, description?: string) => {
      if (!authUser) {
        throw new Error("로그인이 필요합니다.");
      }

      let nextMap: TravelMap;

      try {
        nextMap = await createTravelMap(title, description);
      } catch (error) {
        if (isMissingMapSharingSchemaError(error)) {
          setMapError(MAP_SCHEMA_MISSING_MESSAGE);
        }

        throw error;
      }

      setMaps((current) => [...current, nextMap]);
      setMapError(null);
      selectMap(nextMap.id);
      return nextMap;
    },
    [authUser, selectMap]
  );

  const value = useMemo(
    () => ({
      authUser,
      maps,
      currentMap,
      isLoadingMaps,
      mapError,
      canEditCurrentMap: canEditMap(currentMap?.role),
      selectMap,
      refreshMaps,
      createMap,
    }),
    [
      authUser,
      maps,
      currentMap,
      isLoadingMaps,
      mapError,
      selectMap,
      refreshMaps,
      createMap,
    ]
  );

  return <TravelMapContext.Provider value={value}>{children}</TravelMapContext.Provider>;
}

export function useTravelMaps() {
  const context = useContext(TravelMapContext);

  if (!context) {
    throw new Error("useTravelMaps must be used inside TravelMapProvider.");
  }

  return context;
}
