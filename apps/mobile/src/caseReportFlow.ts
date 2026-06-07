export type CaseReportMaterial = {
  id: string;
  title: string;
  available: boolean;
};

export function getSelectableCaseReportMaterials<T extends CaseReportMaterial>(materials: T[]): T[] {
  return materials.filter((material) => material.available);
}
