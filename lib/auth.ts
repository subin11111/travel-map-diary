export const AUTH_HANDLE_DOMAIN = "users.travel-map-diary.local";
const LEGACY_AUTH_HANDLE_DOMAINS = ["gmail.com"];
export type AuthEmailProvider = "internal" | "legacy";

export function normalizeAuthHandle(value: string) {
  return value.trim().toLowerCase();
}

export function validateAuthHandle(value: string) {
  const handle = normalizeAuthHandle(value);

  if (!handle) {
    return "아이디를 입력하세요.";
  }

  if (handle.length < 3 || handle.length > 32) {
    return "아이디는 3자 이상 32자 이하로 입력하세요.";
  }

  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(handle)) {
    return "아이디는 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.";
  }

  return null;
}

export function buildAuthEmail(handle: string) {
  return `${normalizeAuthHandle(handle)}@${AUTH_HANDLE_DOMAIN}`;
}

export function buildAuthEmailCandidates(handle: string) {
  const normalizedHandle = normalizeAuthHandle(handle);
  return [AUTH_HANDLE_DOMAIN, ...LEGACY_AUTH_HANDLE_DOMAINS]
    .filter((domain, index, domains) => domains.indexOf(domain) === index)
    .map((domain) => `${normalizedHandle}@${domain}`);
}

export function buildAuthLoginCandidates(handle: string) {
  const normalizedHandle = normalizeAuthHandle(handle);
  const candidates: { email: string; provider: AuthEmailProvider }[] = [
    {
      email: `${normalizedHandle}@${AUTH_HANDLE_DOMAIN}`,
      provider: "internal",
    },
  ];

  LEGACY_AUTH_HANDLE_DOMAINS.forEach((domain) => {
    if (domain !== AUTH_HANDLE_DOMAIN) {
      candidates.push({
        email: `${normalizedHandle}@${domain}`,
        provider: "legacy",
      });
    }
  });

  return candidates;
}
