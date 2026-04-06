/**
 * Upload Service Worker — background upload queue that survives page refresh.
 *
 * Lifecycle: installed once, runs independently of pages.
 * Communicates via postMessage to/from pages.
 */

const queue = [];
let processing = false;

function guessMediaType(url) {
  const lower = url.toLowerCase();
  if (lower.match(/\.(mp4|mov|avi|webm|mkv)/)) return "video/mp4";
  if (lower.match(/\.(gif)/)) return "image/gif";
  if (lower.match(/\.(png)/)) return "image/png";
  if (lower.match(/\.(webp)/)) return "image/webp";
  return "image/jpeg";
}

function broadcast(msg) {
  self.clients.matchAll().then((clients) => {
    for (const client of clients) {
      client.postMessage(msg);
    }
  });
}

function broadcastStatus() {
  const activeCount = queue.filter(i => i.status === "queued" || i.status === "uploading").length;
  const doneCount = queue.filter(i => i.status === "done").length;
  const errorCount = queue.filter(i => i.status === "error").length;
  broadcast({
    type: "upload-progress",
    items: queue.map(i => ({ id: i.id, fileName: i.fileName, status: i.status, error: i.error })),
    activeCount,
    doneCount,
    errorCount,
  });
}

function updateItem(id, status, error) {
  const item = queue.find(i => i.id === id);
  if (item) {
    item.status = status;
    if (error) item.error = error;
  }
  broadcastStatus();
}

async function processNext() {
  if (processing) return;

  const next = queue.find(i => i.status === "queued");
  if (!next) return;

  processing = true;
  updateItem(next.id, "uploading");

  try {
    if (next.sourceUrl) {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: next.siteId,
          storage_url: next.sourceUrl,
          media_type: guessMediaType(next.sourceUrl),
          context_note: next.contextNote || null,
          project_id: next.projectId || null,
          source: "url",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register asset");
    } else if (next.fileData) {
      const contentType = next.fileType
        || (next.fileName.toLowerCase().endsWith(".heic") ? "image/heic" : "")
        || (next.fileName.toLowerCase().endsWith(".heif") ? "image/heic" : "")
        || "image/jpeg";

      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: next.siteId,
          content_type: contentType,
          filename: next.fileName,
        }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json();
        throw new Error(err.error || "Failed to get upload URL");
      }

      const { upload_url, public_url, media_type } = await presignRes.json();

      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: next.fileData,
      });

      if (!uploadRes.ok) throw new Error("Upload to storage failed: " + uploadRes.status);

      const assetRes = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: next.siteId,
          storage_url: public_url,
          media_type,
          context_note: next.contextNote || null,
          project_id: next.projectId || null,
        }),
      });

      const assetData = await assetRes.json();
      if (!assetRes.ok) throw new Error(assetData.error || "Failed to register asset");
    }

    updateItem(next.id, "done");
  } catch (err) {
    updateItem(next.id, "error", err.message || "Upload failed");
  }

  processing = false;
  setTimeout(processNext, 100);
}

// Service Worker lifecycle
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle messages from pages
self.addEventListener("message", (event) => {
  const msg = event.data;

  if (msg.type === "upload-enqueue") {
    for (const item of msg.items) {
      queue.push({
        id: item.id,
        fileData: item.fileData || null,
        fileType: item.fileType || null,
        sourceUrl: item.sourceUrl || null,
        contextNote: item.contextNote,
        siteId: item.siteId,
        projectId: item.projectId,
        fileName: item.fileName,
        status: "queued",
        error: null,
      });
    }
    broadcastStatus();
    processNext();
  }

  if (msg.type === "upload-clear") {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].status === "done" || queue[i].status === "error") {
        queue.splice(i, 1);
      }
    }
    broadcastStatus();
  }

  if (msg.type === "upload-status") {
    broadcastStatus();
  }
});

// Keep alive during fetch operations
self.addEventListener("fetch", () => {
  // No-op — we don't intercept fetches, but having the listener
  // keeps the SW registered as a fetch handler
});
