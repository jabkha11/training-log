const INSTALL_ID_STORAGE_KEY = "tl_web_install_id_v1";
const SERVICE_WORKER_URL = "/sw.js";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "";
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type RestTimerNotificationState = {
  status: "unsupported" | "needs-install" | "available" | "ready" | "denied" | "error";
  message: string;
  canEnable: boolean;
  enabled: boolean;
};

export type ScheduleRestTimerNotificationInput = {
  timerId: string;
  dayId: string;
  route: string;
  durationSeconds: number;
  scheduledFor: Date;
  title: string;
  body: string;
};

let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function resolveApiUrl(path: string) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function ensureJsonOk(response: Response) {
  if (response.ok) return response;

  const message = await response.text();
  throw new Error(message || `Request failed with status ${response.status}`);
}

function isWebEnvironment() {
  return typeof window !== "undefined";
}

function isStandaloneMode() {
  if (!isWebEnvironment()) return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function hasPushPrimitives() {
  return (
    isWebEnvironment() &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    VAPID_PUBLIC_KEY !== ""
  );
}

function getInstallId() {
  if (!isWebEnvironment()) return null;

  const existing = window.localStorage.getItem(INSTALL_ID_STORAGE_KEY);
  if (existing) return existing;

  const nextId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(INSTALL_ID_STORAGE_KEY, nextId);
  return nextId;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(normalized);

  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export function getRestTimerNotificationState(): RestTimerNotificationState {
  if (!isWebEnvironment()) {
    return {
      status: "unsupported",
      message: "Background rest alerts are only available on the web app.",
      canEnable: false,
      enabled: false,
    };
  }

  if (!hasPushPrimitives()) {
    return {
      status: "unsupported",
      message: "This browser does not support installed-web-app rest alerts.",
      canEnable: false,
      enabled: false,
    };
  }

  if (!isStandaloneMode()) {
    return {
      status: "needs-install",
      message: "Add this app to your Home Screen to get background rest alerts on iPhone.",
      canEnable: false,
      enabled: false,
    };
  }

  if (Notification.permission === "granted") {
    return {
      status: "ready",
      message: "Background rest alerts are enabled on this device.",
      canEnable: false,
      enabled: true,
    };
  }

  if (Notification.permission === "denied") {
    return {
      status: "denied",
      message: "Notifications are blocked for this app. Re-enable them in browser settings.",
      canEnable: false,
      enabled: false,
    };
  }

  return {
    status: "available",
    message: "Enable notifications to get a rest-complete alert while the app is in the background.",
    canEnable: true,
    enabled: false,
  };
}

export async function registerRestTimerServiceWorker() {
  if (!hasPushPrimitives()) return null;

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null);
  }

  return serviceWorkerRegistrationPromise;
}

async function persistSubscription(registration: ServiceWorkerRegistration) {
  const installId = getInstallId();
  if (!installId) throw new Error("Missing install identifier");

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const subscriptionJson = subscription.toJSON();

  await ensureJsonOk(await fetch(resolveApiUrl("/api/notifications/subscriptions"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      installId,
      subscription: {
        endpoint: subscription.endpoint,
        expirationTime: subscriptionJson.expirationTime ?? null,
        keys: subscriptionJson.keys,
      },
    }),
  }));

  return installId;
}

export async function enableRestTimerNotifications() {
  const state = getRestTimerNotificationState();
  if (state.status === "unsupported" || state.status === "needs-install") {
    return state;
  }

  if (state.status === "denied") {
    return state;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return getRestTimerNotificationState();
  }

  const registration = await registerRestTimerServiceWorker();
  if (!registration) {
    return {
      status: "error",
      message: "Unable to register the notification service worker.",
      canEnable: false,
      enabled: false,
    } satisfies RestTimerNotificationState;
  }

  await persistSubscription(registration);
  return getRestTimerNotificationState();
}

async function ensureSubscriptionReady() {
  if (!hasPushPrimitives() || !isStandaloneMode() || Notification.permission !== "granted") {
    return null;
  }

  const registration = await registerRestTimerServiceWorker();
  if (!registration) return null;

  const installId = await persistSubscription(registration);
  return installId;
}

export async function scheduleRestTimerNotification(
  input: ScheduleRestTimerNotificationInput,
) {
  const installId = await ensureSubscriptionReady();
  if (!installId) return false;

  await ensureJsonOk(await fetch(resolveApiUrl("/api/notifications/rest-timers"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      timerId: input.timerId,
      installId,
      dayId: input.dayId,
      route: input.route,
      durationSeconds: input.durationSeconds,
      scheduledFor: input.scheduledFor.toISOString(),
      title: input.title,
      body: input.body,
    }),
  }));

  return true;
}

export async function cancelRestTimerNotification(timerId: string | null) {
  if (!timerId) return;

  const installId = getInstallId();
  if (!installId) return;

  await ensureJsonOk(await fetch(
    resolveApiUrl(
      `/api/notifications/rest-timers/${encodeURIComponent(timerId)}?installId=${encodeURIComponent(installId)}`,
    ),
    { method: "DELETE" },
  ));
}
