import { Platform } from "react-native";

export function configuredApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  // iOS 模拟器里 localhost 会映射到 Mac，不能用 127.0.0.1
  if (Platform.OS === "ios") return "http://localhost:8000/api/v1";
  // Android 真机/直接 gradle 打包出 release 时无法保证注入 EXPO_PUBLIC_API_BASE_URL，
  // 统一兜底生产域名；本地开发可用 EXPO_PUBLIC_API_BASE_URL 覆盖。
  if (Platform.OS === "android") return "https://maxpeking.top/api/v1";
  return "http://127.0.0.1:8000/api/v1";
}
