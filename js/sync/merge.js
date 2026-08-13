function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function snapshotsEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function mergeValue(base, local, remote, path, conflicts) {
  if (snapshotsEqual(local, remote)) return local;
  if (snapshotsEqual(local, base)) return remote;
  if (snapshotsEqual(remote, base)) return local;
  conflicts.push({ path, base, local, remote });
  return local;
}

function byId(items = []) {
  return new Map(items.map((item) => [String(item.id), item]));
}

function mergeCollection(baseItems, localItems, remoteItems, path, conflicts) {
  const base = byId(baseItems);
  const local = byId(localItems);
  const remote = byId(remoteItems);
  const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const merged = [];
  [...ids].sort().forEach((id) => {
    const value = mergeValue(base.get(id), local.get(id), remote.get(id), `${path}.${id}`, conflicts);
    if (value !== undefined) merged.push(value);
  });
  return merged;
}

function mergeSchedule(base = {}, local = {}, remote = {}, conflicts) {
  return {
    course: mergeValue(base.course, local.course, remote.course, 'schedule.course', conflicts) || '',
    yearLevel: mergeValue(base.yearLevel, local.yearLevel, remote.yearLevel, 'schedule.yearLevel', conflicts) || '',
    semester: mergeValue(base.semester, local.semester, remote.semester, 'schedule.semester', conflicts) || '',
    classes: mergeCollection(base.classes, local.classes, remote.classes, 'schedule.classes', conflicts),
  };
}

export function mergeCloudSnapshots(base, local, remote) {
  if (!base) return {
    snapshot: null,
    conflicts: [{ path: '$', base: null, local, remote, reason: 'missing-common-base' }],
  };
  const conflicts = [];
  return {
    snapshot: {
      schemaVersion: Math.max(base.schemaVersion || 1, local.schemaVersion || 1, remote.schemaVersion || 1),
      schedule: mergeSchedule(base.schedule, local.schedule, remote.schedule, conflicts),
      tasks: mergeCollection(base.tasks, local.tasks, remote.tasks, 'tasks', conflicts),
      notes: mergeCollection(base.notes, local.notes, remote.notes, 'notes', conflicts),
      exams: mergeCollection(base.exams, local.exams, remote.exams, 'exams', conflicts),
      archives: mergeCollection(base.archives, local.archives, remote.archives, 'archives', conflicts),
    },
    conflicts,
  };
}
