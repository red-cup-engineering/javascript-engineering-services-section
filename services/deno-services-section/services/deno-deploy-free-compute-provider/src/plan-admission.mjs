export function findFreeVerifiedOrganization(document, slug) {
  const organizations = Array.isArray(document)
    ? document
    : Array.isArray(document?.items)
    ? document.items
    : Array.isArray(document?.organizations)
    ? document.organizations
    : [];
  const matches = organizations.filter((item) => item && typeof item === "object" && item.slug === slug);
  if (matches.length !== 1) return Object.freeze({ admitted: false, reason: "exact-organization-required" });
  if (matches[0].plan !== "free_verified") {
    return Object.freeze({ admitted: false, reason: "free-verified-plan-required", observedPlan: matches[0].plan ?? null });
  }
  return Object.freeze({ admitted: true, plan: "free_verified" });
}
