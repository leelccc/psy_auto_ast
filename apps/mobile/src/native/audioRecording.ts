import type { PickedLocalFile } from "./filePicker";


export type RecordedLocalAudio = {
  uri: string;
  durationSeconds: number;
  mimeType: "audio/mp4" | "audio/webm";
};

export type AudioRecordingDriver = {
  requestPermission(): Promise<boolean>;
  prepare(): Promise<void>;
  start(): void;
  pause(): void;
  stop(): Promise<{
    uri: string;
    durationMillis: number;
    mimeType: RecordedLocalAudio["mimeType"];
  }>;
};

export type AudioRecordingController = {
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<RecordedLocalAudio>;
  state(): "idle" | "recording" | "paused" | "stopped";
};

export function createAudioRecordingController(
  driver: AudioRecordingDriver,
): AudioRecordingController {
  let currentState: ReturnType<AudioRecordingController["state"]> = "idle";
  return {
    async start() {
      if (!(await driver.requestPermission())) {
        throw new Error("未获得麦克风权限。");
      }
      await driver.prepare();
      driver.start();
      currentState = "recording";
    },
    pause() {
      if (currentState !== "recording") return;
      driver.pause();
      currentState = "paused";
    },
    resume() {
      if (currentState !== "paused") return;
      driver.start();
      currentState = "recording";
    },
    async stop() {
      if (currentState === "idle" || currentState === "stopped") {
        throw new Error("当前没有可保存的录音。");
      }
      const result = await driver.stop();
      currentState = "stopped";
      return {
        uri: result.uri,
        durationSeconds: Math.max(1, Math.ceil(result.durationMillis / 1000)),
        mimeType: result.mimeType,
      };
    },
    state: () => currentState,
  };
}

type ExpoRecorder = {
  uri: string | null;
  record(): void;
  pause(): void;
  stop(): Promise<void>;
  prepareToRecordAsync(): Promise<void>;
  getStatus(): { durationMillis: number };
};

type ExpoAudioPermissions = {
  requestRecordingPermissionsAsync(): Promise<{ granted: boolean }>;
  setAudioModeAsync(mode: {
    allowsRecording: boolean;
    playsInSilentMode: boolean;
  }): Promise<void>;
};

type LoadExpoAudio = () => Promise<ExpoAudioPermissions>;

type RecordedAudioFileDependencies = {
  readWebBlob(uri: string): Promise<Blob>;
  createWebFile(blob: Blob, filename: string, mimeType: string): File;
  readNativeFile(uri: string): Promise<{ name: string; size: number }>;
};

export function recordingMimeType(
  platform: string,
): RecordedLocalAudio["mimeType"] {
  return platform === "web" ? "audio/webm" : "audio/mp4";
}

export async function toRecordedLocalFile(
  audio: RecordedLocalAudio,
  platform: string,
  dependencies: RecordedAudioFileDependencies = {
    readWebBlob: async (uri) => {
      const response = await fetch(uri);
      if (!response.ok) throw new Error("无法读取浏览器录音数据。");
      return response.blob();
    },
    createWebFile: (blob, filename, mimeType) => (
      new File([blob], filename, { type: mimeType })
    ),
    readNativeFile: async (uri) => {
      const { File: ExpoFile } = await import("expo-file-system");
      const file = new ExpoFile(uri);
      return { name: file.name, size: file.size };
    },
  },
): Promise<PickedLocalFile> {
  const filename = audio.mimeType === "audio/webm"
    ? "recording.webm"
    : "recording.m4a";
  if (platform === "web") {
    const blob = await dependencies.readWebBlob(audio.uri);
    const webFile = dependencies.createWebFile(blob, filename, audio.mimeType);
    return {
      uri: audio.uri,
      name: filename,
      mimeType: audio.mimeType,
      sizeBytes: blob.size,
      webFile,
    };
  }
  const file = await dependencies.readNativeFile(audio.uri);
  return {
    uri: audio.uri,
    name: file.name || filename,
    mimeType: audio.mimeType,
    sizeBytes: file.size,
  };
}

export function createExpoAudioDriver(
  recorder: ExpoRecorder,
  mimeType: RecordedLocalAudio["mimeType"],
  loadAudio: LoadExpoAudio = () => import("expo-audio"),
): AudioRecordingDriver {
  return {
    async requestPermission() {
      const audio = await loadAudio();
      const permission = await audio.requestRecordingPermissionsAsync();
      if (permission.granted) {
        await audio.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      }
      return permission.granted;
    },
    async prepare() {
      await recorder.prepareToRecordAsync();
    },
    start() {
      recorder.record();
    },
    pause() {
      recorder.pause();
    },
    async stop() {
      const durationMillis = recorder.getStatus().durationMillis;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("录音文件未生成。");
      return { uri, durationMillis, mimeType };
    },
  };
}

export function createWebAudioDriver(onMeter: (level: number) => void): AudioRecordingDriver {
  let stream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let accumulatedMillis = 0;
  let audioContext: AudioContext | null = null;
  let animationFrame = 0;

  const stopMeter = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    void audioContext?.close();
    audioContext = null;
    onMeter(0);
  };

  const startMeter = (activeStream: MediaStream) => {
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(activeStream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let lastUpdate = 0;
    const tick = (now: number) => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      if (now - lastUpdate >= 80) {
        onMeter(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 320)));
        lastUpdate = now;
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
  };

  return {
    async requestPermission() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return stream.getAudioTracks().some((track) => track.readyState === "live");
    },
    async prepare() {
      if (!stream) throw new Error("浏览器麦克风尚未就绪。");
      chunks = [];
      accumulatedMillis = 0;
      const preferredType = "audio/webm;codecs=opus";
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(preferredType) ? preferredType : "audio/webm",
        audioBitsPerSecond: 128000,
      });
      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      startMeter(stream);
    },
    start() {
      if (!mediaRecorder) throw new Error("浏览器录音器尚未就绪。");
      if (mediaRecorder.state === "paused") mediaRecorder.resume();
      else mediaRecorder.start(250);
      startedAt = Date.now();
    },
    pause() {
      if (mediaRecorder?.state !== "recording") return;
      accumulatedMillis += Date.now() - startedAt;
      mediaRecorder.pause();
    },
    async stop() {
      if (!mediaRecorder || !stream) throw new Error("当前没有可保存的浏览器录音。");
      if (mediaRecorder.state === "recording") accumulatedMillis += Date.now() - startedAt;
      const stopped = new Promise<void>((resolve) => mediaRecorder?.addEventListener("stop", () => resolve(), { once: true }));
      mediaRecorder.stop();
      await stopped;
      stopMeter();
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      mediaRecorder = null;
      const blob = new Blob(chunks, { type: "audio/webm" });
      chunks = [];
      if (blob.size < 2048) throw new Error("未录到有效声音，请确认浏览器麦克风权限和输入设备后重试。");
      return {
        uri: URL.createObjectURL(blob),
        durationMillis: accumulatedMillis,
        mimeType: "audio/webm",
      };
    },
  };
}
