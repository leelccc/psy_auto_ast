import assert from "node:assert/strict";
import { test } from "node:test";

import { safelyPauseAudioPlayer, toggleAudioPlayback } from "../native/audioPlayback";


test("audio playback loads a short-lived URL before the first play", async () => {
  const calls: string[] = [];
  const result = await toggleAudioPlayback({
    sourceLoaded: false,
    player: {
      playing: false,
      currentTime: 0,
      duration: 0,
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      replace: (url) => calls.push(`replace:${url}`),
      seekTo: async (seconds) => {
        calls.push(`seek:${seconds}`);
      },
    },
    loadSource: async () => "https://minio.test/audio?signature=short-lived",
  });

  assert.equal(result.sourceLoaded, true);
  assert.deepEqual(calls, [
    "replace:https://minio.test/audio?signature=short-lived",
    "play",
  ]);
});

test("audio playback prepares the native audio mode before playing", async () => {
  const calls: string[] = [];
  const result = await toggleAudioPlayback({
    sourceLoaded: true,
    player: {
      playing: false,
      currentTime: 0,
      duration: 10,
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      replace: () => calls.push("replace"),
      seekTo: async (seconds) => {
        calls.push(`seek:${seconds}`);
      },
    },
    loadSource: async () => "unused",
    preparePlayback: async () => {
      calls.push("prepare");
    },
  });

  assert.equal(result.sourceLoaded, true);
  assert.deepEqual(calls, ["replace", "prepare", "play"]);
});


test("audio playback pauses and restarts finished audio", async () => {
  const paused: string[] = [];
  await toggleAudioPlayback({
    sourceLoaded: true,
    player: {
      playing: true,
      currentTime: 4,
      duration: 10,
      play: () => paused.push("play"),
      pause: () => paused.push("pause"),
      replace: () => paused.push("replace"),
      seekTo: async () => {
        paused.push("seek");
      },
    },
    loadSource: async () => "unused",
  });
  assert.deepEqual(paused, ["pause"]);

  const restarted: string[] = [];
  await toggleAudioPlayback({
    sourceLoaded: true,
    player: {
      playing: false,
      currentTime: 10,
      duration: 10,
      play: () => restarted.push("play"),
      pause: () => restarted.push("pause"),
      replace: () => restarted.push("replace"),
      seekTo: async (seconds) => {
        restarted.push(`seek:${seconds}`);
      },
    },
    loadSource: async () => "unused",
  });
  assert.deepEqual(restarted, ["replace", "play"]);
});

test("safe pause ignores released native shared audio objects", () => {
  assert.doesNotThrow(() => safelyPauseAudioPlayer({
    pause: () => {
      throw new Error("FunctionCallException: Calling the 'pause' function has failed -> Caused by: NativeSharedObjectNotFoundException");
    },
  }));
});
