(function () {
  const STORAGE_KEY = 'attendance_lock_state_v1';

  function safeParse(value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn('Failed to parse lock state:', error && error.message ? error.message : error);
      return null;
    }
  }

  function getLockKey(studentId, attendanceDate) {
    return `${String(studentId || '').trim()}::${String(attendanceDate || '').trim()}`;
  }

  function normalizeRecord(record) {
    const studentId = record && (record.studentId || record.studentID || record.id || null);
    const attendanceDate = record && (record.attendanceDate || record.date || null);
    if (!studentId || !attendanceDate) return null;

    return {
      studentId: String(studentId),
      attendanceDate: String(attendanceDate),
      locked: Boolean(record.locked !== false),
      unlockMode: record.unlockMode || 'student-unlock',
      teamId: record.teamId || null,
      teamName: record.teamName || record.lockedByTeamName || 'Unknown Team',
      markedBy: record.markedBy || 'Unknown',
      timestamp: record.timestamp || new Date().toISOString(),
      lastEditedBy: record.lastEditedBy || null,
      lastEditedAt: record.lastEditedAt || null,
      source: record.source || 'attendance-app'
    };
  }

  function getLockState() {
    const state = safeParse(localStorage.getItem(STORAGE_KEY));
    if (state && state.records && typeof state.records === 'object') {
      return state;
    }
    return { version: 1, records: {} };
  }

  function persistLockState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('attendance_lock_sync_channel');
        channel.postMessage({ key: STORAGE_KEY, state });
        channel.close();
      }
    } catch (error) {
      console.warn('Failed to broadcast lock state:', error && error.message ? error.message : error);
    }

    try {
      window.dispatchEvent(new CustomEvent('attendance-lock-sync', { detail: state }));
    } catch (error) {
      console.warn('Failed to dispatch lock sync event:', error && error.message ? error.message : error);
    }

    return state;
  }

  function getStudentAttendanceLockState(studentId, attendanceDate) {
    if (!studentId || !attendanceDate) return null;
    const state = getLockState();
    const key = getLockKey(studentId, attendanceDate);
    const record = state.records && state.records[key];
    return record ? { ...record } : null;
  }

  function getLockStateForRecord(studentId, attendanceDate) {
    return getStudentAttendanceLockState(studentId, attendanceDate);
  }

  function lockStudentAttendance(studentId, attendanceDate, details = {}) {
    const normalized = normalizeRecord({
      studentId,
      attendanceDate,
      locked: true,
      unlockMode: details.unlockMode || 'student-unlock',
      teamId: details.teamId || null,
      teamName: details.teamName || details.lockedByTeamName || 'Unknown Team',
      markedBy: details.markedBy || 'Unknown',
      timestamp: details.timestamp || new Date().toISOString(),
      source: details.source || 'attendance-app'
    });

    if (!normalized) return null;

    const state = getLockState();
    state.records[getLockKey(normalized.studentId, normalized.attendanceDate)] = normalized;
    persistLockState(state);
    return normalized;
  }

  function unlockStudentAttendance(studentId, attendanceDate, unlockMode = 'admin', details = {}) {
    const currentState = getStudentAttendanceLockState(studentId, attendanceDate) || {};
    const normalized = normalizeRecord({
      studentId,
      attendanceDate,
      locked: false,
      unlockMode,
      teamId: details.teamId || currentState.teamId || null,
      teamName: details.teamName || currentState.teamName || 'Unknown Team',
      markedBy: details.markedBy || currentState.markedBy || 'Unknown',
      timestamp: details.timestamp || new Date().toISOString(),
      source: details.source || 'attendance-app',
      lastEditedBy: details.lastEditedBy || null,
      lastEditedAt: details.lastEditedAt || null,
    });

    if (!normalized) return null;

    const state = getLockState();
    state.records[getLockKey(normalized.studentId, normalized.attendanceDate)] = normalized;
    persistLockState(state);
    return normalized;
  }

  function isStudentAttendanceLocked(studentId, attendanceDate) {
    const state = getStudentAttendanceLockState(studentId, attendanceDate);
    return Boolean(state && state.locked !== false);
  }

  function canEditStudentAttendance(studentId, attendanceDate, userRole) {
    const state = getStudentAttendanceLockState(studentId, attendanceDate);
    if (!state) return true;
    if (state.locked === false) {
      if (userRole === 'admin') return true;
      if (userRole === 'incharge') return state.unlockMode === 'student-unlock';
      return false;
    }

    if (userRole === 'admin') return false;
    if (userRole === 'incharge') return false;
    return false;
  }

  function removeLockStateForRecord(studentId, attendanceDate) {
    if (!studentId || !attendanceDate) return false;
    const state = getLockState();
    const key = getLockKey(studentId, attendanceDate);
    if (state.records && state.records[key]) {
      delete state.records[key];
      persistLockState(state);
      return true;
    }
    return false;
  }

  function saveLockStateForRecord(record) {
    const normalized = normalizeRecord(record);
    if (!normalized) return null;
    const state = getLockState();
    state.records[getLockKey(normalized.studentId, normalized.attendanceDate)] = normalized;
    persistLockState(state);
    return normalized;
  }

  function hydrateAttendanceLocks(attendanceRecords) {
    if (!Array.isArray(attendanceRecords)) return attendanceRecords;

    return attendanceRecords.map((record) => {
      if (!record || !record.studentId || !record.attendanceDate) return record;
      const lockState = getStudentAttendanceLockState(record.studentId, record.attendanceDate);
      if (!lockState) return record;

      return {
        ...record,
        locked: Boolean(lockState.locked !== false),
        unlockMode: lockState.unlockMode || record.unlockMode || 'student-unlock',
        teamId: record.teamId || lockState.teamId || null,
        teamName: record.teamName || lockState.teamName || 'Unknown Team',
        markedBy: record.markedBy || lockState.markedBy || 'Unknown',
        timestamp: record.timestamp || lockState.timestamp || new Date().toISOString()
      };
    });
  }

  const lockApi = {
    STORAGE_KEY,
    getLockState,
    getLockStateForRecord,
    getStudentAttendanceLockState,
    saveLockStateForRecord,
    lockStudentAttendance,
    unlockStudentAttendance,
    isStudentAttendanceLocked,
    canEditStudentAttendance,
    removeLockStateForRecord,
    hydrateAttendanceLocks,
    persistLockState,
    getLockKey
  };

  window.AttendanceLockState = lockApi;
})();
