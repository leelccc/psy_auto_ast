import { Platform } from "react-native";

import type { PickedLocalFile } from "./filePicker";


function finitePositiveSeconds(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.ceil(value)) : null;
}

async function readWebAudioDuration(file: PickedLocalFile): Promise<number | null> {
  if (!file.webFile || typeof document === "undefined") return null;
  const objectUrl = URL.createObjectURL(file.webFile);
  try {
    return await new Promise<number | null>((resolve) => {
      const audio = document.createElement("audio");
      const done = (seconds: number | null) => {
        audio.removeAttribute("src");
        audio.load();
        resolve(seconds);
      };
      audio.preload = "metadata";
      audio.onloadedmetadata = () => done(finitePositiveSeconds(audio.duration));
      audio.onerror = () => done(null);
      audio.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function getLocalAudioDurationSeconds(file: PickedLocalFile): Promise<number | null> {
  if (Platform.OS === "web") return readWebAudioDuration(file);
  const { createAudioPlayer } = await import("expo-audio");
  const player = createAudioPlayer({ uri: file.uri }, { updateInterval: 100 });
  try {
    for (let index = 0; index < 30; index += 1) {
      const duration = finitePositiveSeconds(player.duration);
      if (player.isLoaded && duration) return duration;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return finitePositiveSeconds(player.duration);
  } finally {
    player.remove();
  }
}
