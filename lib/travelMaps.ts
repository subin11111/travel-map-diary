import { supabase } from "@/lib/supabase";

export type MapRole = "owner" | "editor" | "viewer";

export type TravelMap = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  created_at: string;
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
        created_at: string;
      }
    | {
        id: string;
        owner_id: string;
        title: string;
        description: string | null;
        created_at: string;
      }[]
    | null;
};

type MapRow = {
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    created_at: string;
};

type SharedMemberRow = {
  id: string;
  map_id: string;
  user_id: string;
  role: MapRole;
  created_at: string;
  user_profiles: { handle: string } | { handle: string }[] | null;
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

export async function fetchTravelMaps() {
  const { data, error } = await supabase
    .from("map_members")
    .select("id, map_id, user_id, role, created_at, maps(id, owner_id, title, description, created_at)")
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

export async function createTravelMap(ownerId: string, title: string, description?: string) {
  const { data, error } = await supabase
    .from("maps")
    .insert({
      owner_id: ownerId,
      title,
      description: description?.trim() || null,
    })
    .select("id, owner_id, title, description, created_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    role: "owner" as const,
  };
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
