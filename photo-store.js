(() => {
  "use strict";

  const DB_NAME = "hard75-photo-db";
  const STORE_NAME = "photos";

  function key(startDate, dayNum) {
    return `${startDate || "start"}:day:${dayNum}`;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Photo storage is not supported by this browser."));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open photo storage."));
      request.onblocked = () => reject(new Error("Photo storage is blocked by another tab."));
    });
  }

  async function withStore(mode, work) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let result;
        try { result = work(store, tx, resolve, reject); }
        catch (error) { reject(error); }
        tx.onerror = () => reject(tx.error || new Error("Photo storage transaction failed."));
        if (result !== undefined) tx.oncomplete = () => resolve(result);
      });
    } finally {
      db.close();
    }
  }

  async function save(photoKey, blob) {
    return withStore("readwrite", (store, tx, resolve, reject) => {
      const request = store.put(blob, photoKey);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async function load(photoKey) {
    return withStore("readonly", (store, tx, resolve, reject) => {
      const request = store.get(photoKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function remove(photoKey) {
    return withStore("readwrite", (store, tx, resolve, reject) => {
      const request = store.delete(photoKey);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async function clear() {
    return withStore("readwrite", (store, tx, resolve, reject) => {
      const request = store.clear();
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  async function entries(prefix = "") {
    return withStore("readonly", (store, tx, resolve, reject) => {
      const items = [];
      const request = store.openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(items); return; }
        if (!prefix || String(cursor.key).startsWith(prefix)) items.push([String(cursor.key), cursor.value]);
        cursor.continue();
      };
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error("Could not read photo."));
      reader.readAsDataURL(blob);
    });
  }

  async function dataURLToBlob(dataURL) {
    const response = await fetch(dataURL);
    if (!response.ok) throw new Error("Could not decode photo backup.");
    return response.blob();
  }

  async function exportPrefix(prefix) {
    const items = await entries(prefix);
    return Promise.all(items.map(async ([photoKey, blob]) => ({
      key: photoKey,
      type: blob.type || "image/jpeg",
      data: await blobToDataURL(blob)
    })));
  }

  async function importEntries(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item.key !== "string" || typeof item.data !== "string") continue;
      const blob = await dataURLToBlob(item.data);
      await save(item.key, blob);
    }
  }

  async function optimizeImage(file, maxDimension = 1600, quality = 0.82) {
    if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) return file;
    if (file.size < 650000) return file;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      if (scale >= 1 && file.size < 1200000) return file;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      return await new Promise(resolve => canvas.toBlob(blob => resolve(blob || file), "image/jpeg", quality));
    } catch {
      return file;
    } finally {
      if (bitmap && typeof bitmap.close === "function") bitmap.close();
    }
  }

  window.HARD75_PHOTOS = { key, save, load, remove, clear, entries, exportPrefix, importEntries, optimizeImage };
})();
