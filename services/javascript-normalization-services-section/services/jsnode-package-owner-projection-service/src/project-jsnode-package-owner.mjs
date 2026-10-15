const OWNERS = Object.freeze({
  engineering: "red-cup-engineering",
  science: "lenticule-science",
  operations: "coesite-operations",
  public: "causeway-services",
});

export function projectJsnodePackageOwner(packagePath) {
  if (typeof packagePath !== "string" || !packagePath) throw new TypeError("packagePath is required");
  const path = "/" + packagePath.replaceAll("\\", "/") + "/";
  const section = /\/services\/(engineering|science|operations|public)-services-section\//u.exec(path);
  if (section) return Object.freeze({ type: "JsnodePackageOwnerProjection", packagePath, owner: OWNERS[section[1]], territory: section[0] });
  const group = "/services/561-group/services/561-group-services-section/";
  if (path.includes(group)) return Object.freeze({ type: "JsnodePackageOwnerProjection", packagePath, owner: "561-group", territory: group });
  throw new Error("no canonical package-owner projection for " + packagePath);
}
