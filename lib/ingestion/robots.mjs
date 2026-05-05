import { fetchWithPolicy, HttpError } from "./http-client.mjs";

function pathMatchesRule(pathname, rulePath) {
  if (!rulePath || rulePath === "/") return true;
  return pathname.startsWith(rulePath);
}

function parseRobots(content) {
  const lines = content.split(/\r?\n/);
  const groups = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const key = field.trim().toLowerCase();

    if (key === "user-agent") {
      current = { userAgent: value.toLowerCase(), allow: [], disallow: [] };
      groups.push(current);
      continue;
    }

    if (!current) continue;
    if (key === "allow") current.allow.push(value);
    if (key === "disallow") current.disallow.push(value);
  }

  return groups;
}

export async function checkRobotsAllowed(targetUrl, userAgent = "cartpricebot") {
  const url = new URL(targetUrl);
  const robotsUrl = `${url.origin}/robots.txt`;

  try {
    const response = await fetchWithPolicy(robotsUrl, {
      cacheTtlMs: 1000 * 60 * 60 * 12,
      minDelayMs: 400,
    });

    const body = typeof response.body === "string" ? response.body : "";
    const groups = parseRobots(body);
    const matchedGroups = groups.filter(
      (group) => group.userAgent === "*" || userAgent.toLowerCase().includes(group.userAgent),
    );

    const relevant = matchedGroups.length > 0 ? matchedGroups : groups.filter((group) => group.userAgent === "*");
    let blockedBy = null;

    for (const group of relevant) {
      for (const disallow of group.disallow) {
        if (disallow && pathMatchesRule(url.pathname, disallow)) {
          blockedBy = disallow;
        }
      }
      for (const allow of group.allow) {
        if (allow && pathMatchesRule(url.pathname, allow)) {
          blockedBy = null;
        }
      }
    }

    return {
      robotsUrl,
      checkedAt: response.fetchedAt,
      allowed: blockedBy === null,
      blockedRule: blockedBy,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        robotsUrl,
        checkedAt: new Date().toISOString(),
        allowed: false,
        blockedRule: "robots_unavailable",
      };
    }
    throw error;
  }
}
