export type AudioPlaybackPlayer = {
  playing: boolean;
  currentTime: number;
  duration: number;
  isLoaded?: boolean;
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
  platformOS = "native",
}: {
  sourceLoaded: boolean;
  player: AudioPlaybackPlayer;
  loadSource: () => Promise<string>;
  preparePlayback?: () => Promise<void>;
  platformOS?: string;
}): Promise<{ sourceLoaded: boolean }> {
  if (player.playing) {
    player.pause();
    return { sourceLoaded };
  }
  // 每次播放前都刷新 source URL，避免 presigned URL 过期导致无声
  const url = await loadSource();
  if (platformOS !== "web") {
    player.replace(url);
    // 等待音频加载完成（isLoaded 变为 true），最多等 8 秒
    const loaded = await waitForPlayerLoaded(player, 8000);
    if (!loaded) {
      throw new Error("音频加载超时，请检查网络后重试。");
    }
  }
  await preparePlayback();
  player.play();
  return { sourceLoaded: true };
}

export function safelyPauseAudioPlayer(player: Pick<AudioPlaybackPlayer, "pause">): void {
  try {
    player.pause();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("NativeSharedObjectNotFoundException")
      || message.includes("native shared object")
      || message.includes("Calling the 'pause' function has failed")
    ) {
      return;
    }
    throw error;
  }
}

/** 轮询等待 player.isLoaded 变为 true，超时返回 false */
async function waitForPlayerLoaded(
  player: AudioPlaybackPlayer,
  timeoutMs: number,
): Promise<boolean> {
  // web 端或部分平台没有 isLoaded 字段，直接返回 true 跳过等待
  if (player.isLoaded === undefined) return true;
  const start = Date.now();
  while (!player.isLoaded) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
  return true;
}
