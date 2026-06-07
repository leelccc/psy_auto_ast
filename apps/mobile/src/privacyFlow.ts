export type PrivacyResource = {
  title: string;
  type: string;
  expires: string;
  preservable: boolean;
};

export function getAuthorizableResources<T extends PrivacyResource>(resources: T[]): T[] {
  return resources.filter((resource) => resource.preservable);
}

export function mergeAuthorizedResources(current: string[], selected: string[]): string[] {
  return Array.from(new Set([...current, ...selected]));
}
