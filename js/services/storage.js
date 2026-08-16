const issues = new Map();

function recoveryKey(key) {
  return `atlas.recovery.corrupt.${key.replace(/^atlas\./, '')}`;
}

function preserveCorruptValue(key, rawValue) {
  if (rawValue === null) return '';
  const backupKey = recoveryKey(key);
  try {
    if (localStorage.getItem(backupKey) === null) {
      localStorage.setItem(backupKey, rawValue);
    }
    return backupKey;
  } catch {
    return '';
  }
}

export function readStoredJson(key, fallback, normalize = (value) => value) {
  const rawValue = localStorage.getItem(key);
  if (rawValue === null) return fallback;

  try {
    const value = normalize(JSON.parse(rawValue));
    issues.delete(key);
    return value;
  } catch (error) {
    const backupKey = preserveCorruptValue(key, rawValue);
    issues.set(key, {
      key,
      backupKey,
      message: error instanceof Error ? error.message : 'The saved value could not be read.',
    });
    return fallback;
  }
}

export function writeStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  issues.delete(key);
  return value;
}

export function getStorageIssues() {
  return [...issues.values()].map((issue) => ({ ...issue }));
}

export function hasStorageIssues() {
  return issues.size > 0;
}

export function reportStorageIssue(key, error, backupKey = '') {
  issues.set(key, {
    key,
    backupKey,
    message: error instanceof Error ? error.message : String(error || 'The saved value could not be read.'),
  });
}
