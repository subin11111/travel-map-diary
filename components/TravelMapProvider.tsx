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
import { isRecoverableAuthError } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  MAP_SCHEMA_MISSING_MESSAGE,
  canEditMap,
  createTravelMap,
  deleteTravelMap,
  fetchTravelMaps,
  isMissingMapSharingSchemaError,
  updateTravelMap,
  type TravelMap,
} from "@/lib/travelMaps";

type CreateMapResult = { ok: true } | { ok: false; errorMessage: string };
type UpdateMapResult = { ok: true } | { ok: false; errorMessage: string };
type DeleteMapResult = { ok: true } | { ok: false; errorMessage: string };

type TravelMapContextValue = {
  authUser: User | null;
  maps: TravelMap[];
  currentMap: TravelMap | null;
  isLoadingMaps: boolean;
  mapError: string | null;
  canEditCurrentMap: boolean;
  selectMap: (mapId: string) => void;
  refreshMaps: () => Promise<void>;
  createMap: (title: string, description?: string) => Promise<CreateMapResult>;
  updateMap: (
    mapId: string,
    input: { title: string; description?: string | null; icon?: string | null }
  ) => Promise<UpdateMapResult>;
  deleteMap: (mapId: string) => Promise<DeleteMapResult>;
};

const TravelMapContext = createContext<TravelMapContextValue | null>(null);

const SELECTED_MAP_STORAGE_KEY = "travel-map-diary:selected-map-id";
const DEFAULT_MAP_TITLE = "나의 일상 지도";

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

  const resetAuthState = useCallback(async (reason: unknown) => {
    console.warn("Recoverable auth session error. Resetting local session.", formatUnknownError(reason));

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (signOutError) {
      console.warn("Local auth session reset failed:", formatUnknownError(signOutError));
    }

    setAuthUser(null);
    setMaps([]);
    setCurrentMapId(null);
    setMapError(null);
    setIsLoadingMaps(false);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SELECTED_MAP_STORAGE_KEY);
    }
  }, []);

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
      const defaultMapResult = await createTravelMap(DEFAULT_MAP_TITLE);

      if (!defaultMapResult.ok) {
        setMapError(
          defaultMapResult.errorMessage === "지도 공유 기능 DB 설정이 아직 완료되지 않았습니다."
            ? MAP_SCHEMA_MISSING_MESSAGE
            : "아직 생성된 지도가 없습니다. 새 지도를 만들면 일상 기록과 사진을 지역별로 남길 수 있습니다."
        );
        setMaps([]);
        setCurrentMapId(null);
        setIsLoadingMaps(false);
        return;
      }

      nextMaps = [defaultMapResult.map];
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
      let currentUser: User | null = null;

      try {
        const { data } = await supabase.auth.getSession();
        currentUser = data.session?.user ?? null;
      } catch (error) {
        if (isRecoverableAuthError(error)) {
          if (!cancelled) {
            await resetAuthState(error);
          }
          return;
        }

        console.warn("Failed to initialize auth session:", formatUnknownError(error));
      }

      if (cancelled) {
        return;
      }

      setAuthUser(currentUser);
      await loadMaps(currentUser);
    }

    void initialize();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      try {
        const currentUser = session?.user ?? null;
        setAuthUser(currentUser);
        void loadMaps(currentUser);
      } catch (error) {
        if (isRecoverableAuthError(error)) {
          void resetAuthState(error);
          return;
        }

        console.warn("Auth state change handling failed:", formatUnknownError(error));
      }
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [loadMaps, resetAuthState]);

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
        return {
          ok: false,
          errorMessage: "로그인 정보를 확인하지 못했습니다.",
        } satisfies CreateMapResult;
      }

      const result = await createTravelMap(title, description);

      if (!result.ok) {
        if (result.errorMessage === "지도 공유 기능 DB 설정이 아직 완료되지 않았습니다.") {
          setMapError(MAP_SCHEMA_MISSING_MESSAGE);
        }

        return {
          ok: false,
          errorMessage: result.errorMessage,
        } satisfies CreateMapResult;
      }

      setMaps((current) => [...current, result.map]);
      setMapError(null);
      selectMap(result.map.id);
      return { ok: true } satisfies CreateMapResult;
    },
    [authUser, selectMap]
  );

  const updateMap = useCallback(
    async (
      mapId: string,
      input: { title: string; description?: string | null; icon?: string | null }
    ) => {
      const targetMap = maps.find((map) => map.id === mapId);

      if (!authUser || targetMap?.role !== "owner") {
        return {
          ok: false,
          errorMessage: "지도 소유자만 지도 정보를 수정할 수 있습니다.",
        } satisfies UpdateMapResult;
      }

      try {
        const updatedMap = await updateTravelMap(mapId, input);

        setMaps((current) =>
          current.map((map) =>
            map.id === mapId
              ? {
                  ...map,
                  ...updatedMap,
                  role: map.role,
                }
              : map
          )
        );
        setMapError(null);
        return { ok: true } satisfies UpdateMapResult;
      } catch (error) {
        console.error("Failed to update map:", formatUnknownError(error));
        return {
          ok: false,
          errorMessage:
            error instanceof Error ? error.message : "지도 정보를 저장하지 못했습니다.",
        } satisfies UpdateMapResult;
      }
    },
    [authUser, maps]
  );

  const deleteMap = useCallback(
    async (mapId: string) => {
      const targetMap = maps.find((map) => map.id === mapId);

      if (!authUser || targetMap?.role !== "owner") {
        return {
          ok: false,
          errorMessage: "지도 소유자만 지도를 삭제할 수 있습니다.",
        } satisfies DeleteMapResult;
      }

      try {
        await deleteTravelMap(mapId);

        const nextMaps = maps.filter((map) => map.id !== mapId);
        const nextMap =
          nextMaps.find((map) => map.role === "owner") ?? nextMaps[0] ?? null;

        setMaps(nextMaps);
        setCurrentMapId(nextMap?.id ?? null);
        setMapError(null);

        if (typeof window !== "undefined") {
          if (nextMap) {
            window.localStorage.setItem(SELECTED_MAP_STORAGE_KEY, nextMap.id);
          } else {
            window.localStorage.removeItem(SELECTED_MAP_STORAGE_KEY);
          }
        }

        return { ok: true } satisfies DeleteMapResult;
      } catch (error) {
        console.error("Failed to delete map:", formatUnknownError(error));
        return {
          ok: false,
          errorMessage:
            error instanceof Error ? error.message : "지도를 삭제하지 못했습니다.",
        } satisfies DeleteMapResult;
      }
    },
    [authUser, maps]
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
      updateMap,
      deleteMap,
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
      updateMap,
      deleteMap,
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
