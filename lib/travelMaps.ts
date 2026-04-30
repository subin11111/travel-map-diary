import { supabase } from "@/lib/supabase";

export type MapRole = "owner" | "editor" | "viewer";

export type TravelMap = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string | null;
  role: MapRole;
};

export type MapMember = {
  id: string;
  map_id: string;
  user_id: string;
  role: MapRole;
  created_at: string;
  handle: string;
};

type MapMemberRow = {
  id: string;
  map_id: string;
  user_id: string;
  role: MapRole;
  created_at: string;
  maps:
    | {
        id: string;
        owner_id: string;
        title: string;
        description: string | null;
        icon: string | null;
        created_at: string;
        updated_at: string | null;
      }
    | {
        id: string;
        owner_id: string;
        title: string;
        description: string | null;
        icon: string | null;
        created_at: string;
        updated_at: string | null;
      }[]
    | null;
};

type MapRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  name?: string;
  status?: number;
  statusText?: string;
  stack?: string;
};

type SharedMemberRow = {
  id: string;
  map_id: string;
  user_id: string;
  role: MapRole;
  created_at: string;
  user_profiles: { handle: string } | { handle: string }[] | null;
};

type CreateTravelMapRow = MapRow & {
  role: MapRole;
};

export type CreateTravelMapResult =
  | { ok: true; map: TravelMap }
  | { ok: false; errorMessage: string; debug?: unknown };

export type UpdateTravelMapInput = {
  title: string;
  description?: string | null;
  icon?: string | null;
};

export const MAP_SCHEMA_MISSING_MESSAGE =
  "지도 공유 기능을 위한 DB 테이블이 아직 생성되지 않았습니다. Supabase SQL 마이그레이션을 적용해 주세요.";

function firstRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function isMissingMapSharingSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message = typeof maybeError.message === "string" ? maybeError.message : "";

  return (
    code === "PGRST205" ||
    (/schema cache/i.test(message) && /map_members|maps/i.test(message))
  );
}

export function canEditMap(role: MapRole | null | undefined) {
  return role === "owner" || role === "editor";
}

export function extractSupabaseErrorDebug(error: unknown) {
  if (error == null) {
    return "No error object was returned.";
  }

  if (typeof error !== "object") {
    return String(error);
  }

  const errorRecord = error as Record<string, unknown>;
  const supabaseError = error as SupabaseErrorLike;
  const ownProperties = Object.getOwnPropertyNames(error).reduce<Record<string, unknown>>(
    (result, key) => ({
      ...result,
      [key]: errorRecord[key],
    }),
    {}
  );
  const enumerableEntries = Object.fromEntries(Object.entries(errorRecord));

  const debug = {
    code: supabaseError.code ?? null,
    message: supabaseError.message ?? null,
    details: supabaseError.details ?? null,
    hint: supabaseError.hint ?? null,
    name: supabaseError.name ?? null,
    status: supabaseError.status ?? null,
    statusText: supabaseError.statusText ?? null,
    stack: supabaseError.stack ?? null,
    ownProperties,
    enumerableEntries,
  };

  return JSON.stringify(debug, null, 2);
}

export function getTravelMapCreateErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "지도를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  const supabaseError = error as SupabaseErrorLike;
  const code = supabaseError.code ?? "";
  const message = supabaseError.message ?? "";

  if (
    code === "PGRST205" ||
    /function.*create_travel_map|schema cache|Could not find/i.test(message)
  ) {
    return "지도 공유 기능 DB 설정이 아직 완료되지 않았습니다.";
  }

  if (code === "42501" || /permission denied|row-level security|RLS/i.test(message)) {
    return "지도 생성 권한 설정이 필요합니다. Supabase 정책을 확인해 주세요.";
  }

  if (code === "23505") {
    return "이미 같은 정보가 저장되어 있습니다.";
  }

  if (code === "23503") {
    return "로그인 정보 또는 지도 권한 연결을 확인하지 못했습니다.";
  }

  if (/auth\.uid|로그인이 필요/i.test(message)) {
    return "로그인 정보를 확인하지 못했습니다.";
  }

  if (/maps/i.test(message)) {
    return "지도 테이블에 저장하지 못했습니다.";
  }

  if (/map_members/i.test(message)) {
    return "지도 소유자 권한을 생성하지 못했습니다.";
  }

  return "지도를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function logSupabaseWarning(context: string, error: unknown) {
  console.warn(`${context}\n${extractSupabaseErrorDebug(error)}`);
}

export async function fetchTravelMaps() {
  const { data, error } = await supabase
    .from("map_members")
    .select("id, map_id, user_id, role, created_at, maps(id, owner_id, title, description, icon, created_at, updated_at)")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as MapMemberRow[])
    .map((membership) => ({
      membership,
      map: firstRelation<MapRow>(membership.maps),
    }))
    .filter((item): item is { membership: MapMemberRow; map: MapRow } => Boolean(item.map))
    .map(({ membership, map }) => ({
      ...map,
      role: membership.role,
    }));
}

export async function createTravelMap(
  title: string,
  description?: string
): Promise<CreateTravelMapResult> {
  const { data, error } = await supabase
    .rpc("create_travel_map", {
      p_title: title,
      p_description: description?.trim() ? description : null,
    })
    .single();

  if (error) {
    logSupabaseWarning("Failed to create travel map via RPC.", error);
    return {
      ok: false,
      errorMessage: getTravelMapCreateErrorMessage(error),
      debug: extractSupabaseErrorDebug(error),
    };
  }

  const createdMap = data as CreateTravelMapRow;

  return {
    ok: true,
    map: {
      ...createdMap,
      icon: createdMap.icon ?? null,
      updated_at: createdMap.updated_at ?? null,
      role: "owner" as const,
    },
  };
}

export async function updateTravelMap(mapId: string, input: UpdateTravelMapInput) {
  const title = input.title.trim();

  if (!title) {
    throw new Error("지도 이름을 입력하세요.");
  }

  const { data, error } = await supabase
    .from("maps")
    .update({
      title,
      description: input.description?.trim() ? input.description.trim() : null,
      icon: input.icon?.trim() ? input.icon.trim() : null,
    })
    .eq("id", mapId)
    .select("id, owner_id, title, description, icon, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data as MapRow;
}

export async function fetchMapMembers(mapId: string) {
  const { data, error } = await supabase
    .from("map_members")
    .select("id, map_id, user_id, role, created_at, user_profiles(handle)")
    .eq("map_id", mapId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as SharedMemberRow[]).map((member) => ({
    id: member.id,
    map_id: member.map_id,
    user_id: member.user_id,
    role: member.role,
    created_at: member.created_at,
    handle: firstRelation(member.user_profiles)?.handle ?? "알 수 없음",
  }));
}

export async function shareTravelMap(mapId: string, handle: string, role: Exclude<MapRole, "owner">) {
  const normalizedHandle = handle.trim().toLowerCase();

  if (!normalizedHandle) {
    throw new Error("공유할 아이디를 입력하세요.");
  }

  const { data: targetUserId, error: lookupError } = await supabase.rpc("get_user_id_by_handle", {
    target_handle: normalizedHandle,
  });

  if (lookupError) {
    throw lookupError;
  }

  if (!targetUserId) {
    throw new Error("해당 아이디를 찾을 수 없습니다.");
  }

  const { data: currentMembership } = await supabase
    .from("map_members")
    .select("user_id, role")
    .eq("map_id", mapId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (currentMembership?.role === "owner") {
    throw new Error("지도 소유자는 공유 대상에서 변경할 수 없습니다.");
  }

  const { error } = await supabase.from("map_members").upsert(
    {
      map_id: mapId,
      user_id: targetUserId,
      role,
    },
    { onConflict: "map_id,user_id" }
  );

  if (error) {
    throw error;
  }
}

export async function removeMapMember(member: MapMember) {
  if (member.role === "owner") {
    throw new Error("지도 소유자는 제거할 수 없습니다.");
  }

  const { error } = await supabase.from("map_members").delete().eq("id", member.id);

  if (error) {
    throw error;
  }
}
