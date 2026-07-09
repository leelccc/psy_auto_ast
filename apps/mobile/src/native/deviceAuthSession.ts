import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { createAuthSessionStore } from "../authSession";

export function createDeviceAuthSessionStore() {
  return createAuthSessionStore({
    async get(key) {
      if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
      return SecureStore.getItemAsync(key);
    },
    async set(key, value) {
      if (Platform.OS === "web") {
        globalThis.localStorage?.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value);
    },
    async remove(key) {
      if (Platform.OS === "web") {
        globalThis.localStorage?.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    },
  });
}
