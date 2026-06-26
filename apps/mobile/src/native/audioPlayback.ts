import { Platform } from "react-native";

export type AudioPlaybackPlayer = {
  playing: boolean;
  currentTime: number;
  duration: number;
  play(): void;
  pause(): void;
  replace(url: string): void;
  seekTo(seconds: number): Promise<void>;
};

export type LoadExpoAudioForPlayback = () => Promise<{
  setAudioModeAsync(mode: {
    allowsRecording?: boolean;
    playsInSilentMode: boolean;
    shouldRouteThroughEarpiece?: boolean;
  }): Promise<void>;
}>;

export async function configureAudioPlaybackMode(
  loadAudio: LoadExpoAudioForPlayback = () => import("expo-audio"),
): Promise<void> {
  const audio = await loadAudio();
  await audio.setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  });
}

export async function toggleAudioPlayback({
  sourceLoaded,
  player,
  loadSource,
  preparePlayback = async () => {},
}: {
  sourceLoaded: boolean;
  player: AudioPlaybackPlayer;
  loadSource: () => Promise<string>;
  preparePlayback?: () => Promise<void>;
}): Promise<{ sourceLoaded: boolean }> {
  if (player.playing) {
    player.pause();
    return { sourceLoaded };
  }
  // 每次播放前都刷新 source URL，避免 presigned URL 过期导致无声
  const url = await loadSource();
  if (Platform.OS !== "web") player.replace(url);
  await preparePlayback();
  if (Platform.OS === "web") {
    // web 端 replace 不生效，需要外部重新设置 <audio>.src 并 load
  }
  player.play();
  return { sourceLoaded: true };
}
