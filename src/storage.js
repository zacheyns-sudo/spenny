const DB_NAME = "spenny-local";
const DB_VERSION = 1;
const STORE = "kv";
const STORAGE_SCHEMA_VERSION = 2;

const DEFAULT_STATE = {
  schemaVersion: STORAGE_SCHEMA_VERSION,
  manualIncome: 0,
  manualBills: [],
  transactions: [],
  dismissedBills: [],
  importBatches: [],
  categoryRules: {},
  aiSettings: {
    enabled: false,
    apiKey: "",
    lastSummary: "",
  },
};

export async function loadState() {
  const db = await openDb();
  const saved = await getValue(db, "state");
  if (saved && saved.schemaVersion !== STORAGE_SCHEMA_VERSION) {
    const fresh = freshState();
    await setValue(db, "state", fresh);
    return fresh;
  }
  return deepMerge(DEFAULT_STATE, saved || {});
}

export async function saveState(state) {
  const db = await openDb();
  const versionedState = { ...state, schemaVersion: STORAGE_SCHEMA_VERSION };
  await setValue(db, "state", versionedState);
  return versionedState;
}

export async function resetState() {
  const db = await openDb();
  const fresh = freshState();
  await setValue(db, "state", fresh);
  return fresh;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getValue(db, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function setValue(db, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const request = transaction.objectStore(STORE).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deepMerge(base, saved) {
  return {
    ...base,
    ...saved,
    aiSettings: {
      ...base.aiSettings,
      ...(saved?.aiSettings || {}),
    },
  };
}

function freshState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
