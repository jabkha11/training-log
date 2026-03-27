import webpush from "web-push";

const vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "";
const vapidSubject = process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:notifications@example.com";

const isConfigured = vapidPublicKey !== "" && vapidPrivateKey !== "";

if (isConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export function isWebPushConfigured() {
  return isConfigured;
}

export function getWebPushPublicKey() {
  return vapidPublicKey;
}

export { webpush };
