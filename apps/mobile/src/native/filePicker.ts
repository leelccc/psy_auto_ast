import type {
  DocumentPickerAsset,
  DocumentPickerResult,
} from "expo-document-picker";


export type PickedLocalFile = {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  webFile?: File;
};

export function mapDocumentPickerResult(
  result: DocumentPickerResult,
): PickedLocalFile | null {
  if (result.canceled || !result.assets[0]) return null;
  const asset: DocumentPickerAsset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? "application/octet-stream",
    sizeBytes: asset.size ?? asset.file?.size ?? 0,
    webFile: asset.file,
  };
}

export async function pickLocalFile(
  mimeTypes: string | string[] = "*/*",
): Promise<PickedLocalFile | null> {
  const picker = await import("expo-document-picker");
  return mapDocumentPickerResult(await picker.getDocumentAsync({
    type: mimeTypes,
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  }));
}
