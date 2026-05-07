const DB_NAME = "spenny-local";
const DB_VERSION = 1;
const STORE = "kv";

const DEFAULT_STATE = {
  manualIncome: 0,
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
  return deepMerge(DEFAULT_STATE, saved || {});
}

export async function saveState(state) {
  const db = await openDb();
  await setValue(db, "state", state);
  return state;
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
