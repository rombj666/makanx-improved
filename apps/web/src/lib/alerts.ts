let readyAudio: HTMLAudioElement | null = null;

const SOUND_URL = "/sounds/mixkit-positive-notification-951.wav";
const SOUND_ENABLED_KEY = "mx_sound_enabled";
const SOUND_PRIMED_KEY = "mx_sound_primed";

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function enableSound(): void {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, "1");
  } catch {
    // ignore
  }
}

export function primeReadySound(): void {
  try {
    if (typeof window === "undefined") return;
    if (!readyAudio) {
      readyAudio = new Audio(SOUND_URL);
    }
    readyAudio.volume = 0.05;
    readyAudio.currentTime = 0;
    readyAudio.play().then(() => {
      readyAudio?.pause();
      try {
        localStorage.setItem(SOUND_PRIMED_KEY, "1");
      } catch {
        // ignore
      }
    }).catch(() => {
      // Autoplay may still block; ignore
    });
  } catch {
    // ignore
  }
}

export function playReadySound(): void {
  try {
    if (typeof window === "undefined") return;
    if (!isSoundEnabled()) return;
    if (!readyAudio) {
      readyAudio = new Audio(SOUND_URL);
    }
    readyAudio.volume = 0.7;
    readyAudio.currentTime = 0;
    readyAudio.play().catch(() => {});
  } catch {
    // never throw
  }
}

export function vibrateReady(): void {
  try {
    if (typeof window === "undefined") return;
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // ignore
  }
}

