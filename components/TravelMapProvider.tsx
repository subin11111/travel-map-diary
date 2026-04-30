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
  canEditMap,
  createTravelMap,
  fetchTravelMaps,
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
      setIsLoadingMaps(false);
      return;
    }

    setIsLoadingMaps(true);
    setMapError(null);

    try {
      let nextMaps = await fetchTravelMaps();

      if (nextMaps.length === 0) {
        const defaultMap = await createTravelMap(user.id, "내 여행 지도");
        nextMaps = [defaultMap];
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
    } catch (error) {
      console.error("Failed to load maps:", error);
      setMapError("지도 목록을 불러오지 못했습니다.");
      setMaps([]);
      setCurrentMapId(null);
    } finally {
      setIsLoadingMaps(false);
    }
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

      const nextMap = await createTravelMap(authUser.id, title, description);
      setMaps((current) => [...current, nextMap]);
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
