/**
 * The microphone, for Ramble: records one take and says how loud it is.
 *
 * Started from the button's click itself, not from an effect after the card
 * opens, because Safari only lets an audio context run from inside a
 * gesture, and the waveform needs one. The recording is kept in memory
 * only, until the card is done with it.
 */

import { RECORDING_BITS_PER_SECOND, recordingType } from "./recording";

export interface Recorder {
  /** Settles once recording has begun, or with why the microphone refused. */
  ready: Promise<void>;
  /** Ends the take and hands over the audio. */
  stop: () => Promise<Blob>;
  /** Ends the take and throws it away. */
  cancel: () => void;
  /** Holds the take; what is said meanwhile is not recorded. */
  pause: () => void;
  /** Carries the take on after a pause. */
  resume: () => void;
  /** How loud it is now: the signal's RMS, 0 to 1 (lib/ramble/waveform reads it as decibels). */
  rms: () => number;
}

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export function startRecorder(): Recorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Uint8Array<ArrayBuffer> | null = null;
  let cancelled = false;
  const chunks: Blob[] = [];

  /* Made now, inside the click, so Safari lets it run. */
  let audio: AudioContext | null = null;
  try {
    const Context = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    audio = Context ? new Context() : null;
  } catch {
    audio = null;
  }

  function release() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    analyser = null;
    void audio?.close().catch(() => {});
    audio = null;
  }

  const ready = (async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw Object.assign(new Error("This browser cannot record."), { name: "NotSupportedError" });
    }
    const media = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (cancelled) {
      media.getTracks().forEach((track) => track.stop());
      throw Object.assign(new Error("Cancelled."), { name: "AbortError" });
    }
    stream = media;

    const mimeType = recordingType((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(media, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    /* In slices of a second, so a take is never all held in the encoder
       when it ends. */
    recorder.start(1000);

    if (audio) {
      try {
        const node = audio.createAnalyser();
        /* About 21 ms of signal at 48 kHz: short enough that a syllable's
           rise shows in the waveform as it is said. */
        node.fftSize = 1024;
        audio.createMediaStreamSource(media).connect(node);
        samples = new Uint8Array(new ArrayBuffer(node.fftSize));
        analyser = node;
        void audio.resume().catch(() => {});
      } catch {
        analyser = null;
      }
    }
  })();
  ready.catch(() => release());

  return {
    ready,
    stop: () => new Promise<Blob>((resolve, reject) => {
      const active = recorder;
      const take = () => new Blob(chunks, { type: active?.mimeType || chunks[0]?.type || "audio/webm" });
      /* Stopped already, by itself: the microphone went away (AirPods
         disconnected, the input revoked). What it recorded is still here. */
      if (!active || active.state === "inactive") {
        release();
        if (chunks.length > 0) resolve(take());
        else reject(new Error("Nothing was recorded."));
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        release();
        if (chunks.length > 0) resolve(take());
        else reject(new Error("Nothing was recorded."));
      };
      active.onstop = finish;
      /* Stopped from a pause it is resumed first, in case a browser does
         not answer a stop while paused; and a stop that never answers is
         taken as given after three seconds, with what was recorded. */
      if (active.state === "paused") active.resume();
      active.stop();
      window.setTimeout(finish, 3000);
    }),
    cancel: () => {
      cancelled = true;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      release();
    },
    pause: () => {
      if (recorder?.state === "recording") recorder.pause();
    },
    resume: () => {
      if (recorder?.state === "paused") recorder.resume();
    },
    rms: () => {
      if (!analyser || !samples) return 0;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centred = (sample - 128) / 128;
        sum += centred * centred;
      }
      return Math.sqrt(sum / samples.length);
    },
  };
}
