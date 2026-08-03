// Complete Application Logic Connected to Firebase Firestore (finearts-e0cac) + Calendar Date Viewer

// Application State
const defaultAppData = {
  users: [
    { id: "u1", username: "admin", password: "admin123", role: "admin", name: "System Administrator" },
    { id: "u2", username: "incharge1", password: "user123", role: "incharge", name: "Student Incharge 1" }
  ],
  departments: ["Computer Science", "Information Technology", "Electronics & Comm", "Commerce", "Mathematics"],
  sections: ["Section A", "Section B", "Section C", "Section D"],
  teams: ["Team Alpha", "Team Beta", "Team Gamma", "Team Delta"],
  students: [
    { id: "s1", name: "John Doe", rollNumber: "21CS01", registerNumber: "910021104001", mobile: "9876543210", department: "Aided", deptName: "Computer Science", section: "Section A", teamId: "Team Alpha" },
    { id: "s2", name: "Jane Smith", rollNumber: "21CS02", registerNumber: "910021104002", mobile: "9876543211", department: "Self-Finance", deptName: "Information Technology", section: "Section B", teamId: "Team Alpha" },
    { id: "s3", name: "Robert Brown", rollNumber: "21CS03", registerNumber: "910021104003", mobile: "9876543212", department: "Aided", deptName: "Commerce", section: "Section A", teamId: "Team Beta" },
    { id: "s4", name: "Emily Davis", rollNumber: "21CS04", registerNumber: "910021104004", mobile: "9876543213", department: "Self-Finance", deptName: "Mathematics", section: "Section C", teamId: "Team Gamma" }
  ],
  attendance: []
};

let appData = JSON.parse(JSON.stringify(defaultAppData));
let currentUser = null;
let currentTabId = 'dashboardTab';
let firestoreDb = null;
let auth = null;
let firestoreListenerRegistered = false;
let firestoreListenerUnsubscribe = null;
let firebaseAuthReadyPromise = null;
let currentFirebaseUser = null;
let firestoreSyncHealthy = false;
let lastFirestoreError = null;
const API_TIMEOUT_MS = 1200;
const OFFLINE_MODE_KEY = 'attendance_app_force_offline';

function withTimeout(promise, timeoutMs = API_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
    })
  ]);
}

Object.defineProperty(globalThis, 'appData', {
  configurable: true,
  enumerable: true,
  get() {
    return appData;
  },
  set(value) {
    appData = value;
  }
});

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  if (window.__attendanceAppInitialized) return;
  window.__attendanceAppInitialized = true;

  initFirebase();

  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (event) => {
      if (!event.defaultPrevented) {
        event.preventDefault();
      }
    });
  });

  const storedUser = sessionStorage.getItem('attendance_session_user');
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
      showDashboard();
    } catch (error) {
      console.warn('Stored session is invalid, clearing it.', error.message);
      sessionStorage.removeItem('attendance_session_user');
      currentUser = null;
    }
  }

  initAuth();
  initUIEvents();
  initUIVisibilityGuard();
  initPasswordToggles();

  loadAppData().then(() => {
    if (currentUser) {
      renderAllViews();
    } else {
      document.getElementById('authWrapper')?.classList.remove('hidden');
      document.getElementById('appHeader')?.classList.add('hidden');
      document.getElementById('mainContainer')?.classList.add('hidden');
      document.getElementById('appSidebar')?.classList.add('hidden');
    }
  }).catch(error => {
    console.warn('Data load failed during startup:', error.message);
    if (!currentUser) {
      document.getElementById('authWrapper')?.classList.remove('hidden');
      document.getElementById('appHeader')?.classList.add('hidden');
      document.getElementById('mainContainer')?.classList.add('hidden');
      document.getElementById('appSidebar')?.classList.add('hidden');
    }
  });
});

function getMergedAppData(source) {
  const merged = {
    users: Array.isArray(source?.users) && source.users.length ? source.users : defaultAppData.users,
    departments: Array.isArray(source?.departments) && source.departments.length ? source.departments : defaultAppData.departments,
    sections: Array.isArray(source?.sections) && source.sections.length ? source.sections : defaultAppData.sections,
    teams: Array.isArray(source?.teams) && source.teams.length ? source.teams : defaultAppData.teams,
    students: Array.isArray(source?.students) && source.students.length ? source.students : defaultAppData.students,
    attendance: Array.isArray(source?.attendance) ? source.attendance : defaultAppData.attendance,
  };

  // preserve any extra properties without losing defaults
  return { ...defaultAppData, ...merged, ...source };
}

// Initialize Firebase Auth + Firestore
function getFirestoreDocRef() {
  if (!firestoreDb) return null;
  return firestoreDb.collection('attendance_master_data').doc('appData');
}

async function waitForFirebaseAuth() {
  if (currentFirebaseUser) return currentFirebaseUser;
  if (!auth) {
    throw new Error('Firebase Authentication is unavailable for this browser session.');
  }

  if (!firebaseAuthReadyPromise) {
    firebaseAuthReadyPromise = new Promise((resolve, reject) => {
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (user) {
          unsubscribe();
          currentFirebaseUser = user;
          console.log('Firebase Auth state detected existing user', user.uid);
          resolve(user);
          return;
        }

        try {
          const result = await auth.signInAnonymously();
          unsubscribe();
          currentFirebaseUser = result?.user || null;
          console.log('Firebase anonymous auth succeeded', currentFirebaseUser?.uid);
          resolve(currentFirebaseUser);
        } catch (error) {
          unsubscribe();
          console.warn('Firebase anonymous auth failed:', error.message);
          reject(error);
        }
      }, reject);
    });
  }

  return firebaseAuthReadyPromise;
}

function initFirebase() {
  if (window.__attendanceFirebaseInitialized) return;
  window.__attendanceFirebaseInitialized = true;

  if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0) {
    console.warn('Firebase SDK is not available. Firestore data sync is disabled.');
    return;
  }

  try {
    auth = typeof firebase.auth === 'function' ? firebase.auth() : null;
    firestoreDb = typeof firebase.firestore === 'function' ? firebase.firestore() : null;

    if (firestoreDb && typeof firestoreDb.enablePersistence === 'function') {
      firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {
        console.warn('Firestore persistence could not be enabled in this browser session.');
      });
    }

    if (firestoreDb) {
      registerFirestoreListener();
    }
  } catch (e) {
    console.warn('Firebase initialization error:', e.message);
  }
}

async function registerFirestoreListener() {
  if (firestoreListenerRegistered || !firestoreDb) return;

  try {
    await waitForFirebaseAuth();
    const docRef = getFirestoreDocRef();
    if (!docRef) return;

    firestoreListenerRegistered = true;
    firestoreListenerUnsubscribe = docRef.onSnapshot((doc) => {
      const val = doc.data();
      if (val && (val.users || val.students || val.attendance || val.departments || val.sections || val.teams)) {
        appData = getMergedAppData(val);
        firestoreSyncHealthy = true;
        lastFirestoreError = null;
        console.log('Firestore sync update received', { users: appData.users.length, students: appData.students.length, attendance: appData.attendance.length });
        if (currentUser) renderAllViews();
      }
    }, (error) => {
      firestoreSyncHealthy = false;
      lastFirestoreError = error;
      console.warn('Firestore listener error:', error.message);
    });
  } catch (e) {
    console.warn('Firestore listener setup failed:', e.message);
  }
}

// Load Application Data
async function loadAppData() {
  const isOnline = typeof navigator !== 'undefined' && navigator.onLine !== false;
  const offlineForced = localStorage.getItem(OFFLINE_MODE_KEY) === 'true';

  if (firestoreDb && isOnline && !offlineForced) {
    try {
      await waitForFirebaseAuth();
      const docRef = getFirestoreDocRef();
      const snapshot = await withTimeout(docRef.get());
      const val = snapshot.data();
      if (val && (val.users || val.students || val.attendance || val.departments || val.sections || val.teams)) {
        appData = getMergedAppData(val);
        firestoreSyncHealthy = true;
        lastFirestoreError = null;
        console.log('Data loaded successfully from Firestore', { source: 'firestore', count: { users: appData.users.length, students: appData.students.length, attendance: appData.attendance.length } });
        return;
      }
      firestoreSyncHealthy = false;
      console.warn('Firestore document exists but has no expected app data structure. Not using local fallback while online.');
    } catch (err) {
      firestoreSyncHealthy = false;
      lastFirestoreError = err;
      console.warn('Firestore load warning:', err.message);
    }
  }

  if (!isOnline || offlineForced) {
    const local = localStorage.getItem('attendance_app_data');
    if (local) {
      const localData = JSON.parse(local);
      appData = getMergedAppData(localData);
      console.log('Loaded fallback data from localStorage', { users: appData.users.length, students: appData.students.length, attendance: appData.attendance.length });
    }
  }
}

// Save Application Data
async function saveAppData() {
  localStorage.setItem('attendance_app_data', JSON.stringify(appData));

  const remoteSyncEnabled = localStorage.getItem(OFFLINE_MODE_KEY) !== 'true' && (typeof navigator === 'undefined' || navigator.onLine !== false);

  if (!remoteSyncEnabled || !firestoreDb) {
    if (!remoteSyncEnabled) console.log('Remote sync disabled, skipping Firestore save.');
    return;
  }

  try {
    await waitForFirebaseAuth();
    const docRef = getFirestoreDocRef();
    await withTimeout(docRef.set(appData));
    firestoreSyncHealthy = true;
    lastFirestoreError = null;
    console.log('Saved successfully to Firestore', { users: appData.users.length, students: appData.students.length, attendance: appData.attendance.length });
  } catch (err) {
    firestoreSyncHealthy = false;
    lastFirestoreError = err;
    console.warn('Firestore save warning:', err.message);
  }
}

// Password Eye Toggles
function initPasswordToggles() {
  document.querySelectorAll('.password-wrapper').forEach(wrapper => {
    const input = wrapper.querySelector('input');
    const eyeBtn = wrapper.querySelector('.eye-btn');
    if (input && eyeBtn) {
      eyeBtn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        eyeBtn.textContent = isPassword ? '🙈' : '👁️';
      });
    }
  });
}

// Authentication System
function initAuth() {
  const loginForm = document.getElementById('loginForm');
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    const user = appData.users.find(u => u.username === username && u.password === password);
    if (user) {
      currentUser = user;
      sessionStorage.setItem('attendance_session_user', JSON.stringify(user));
      showDashboard();
    } else {
      alert('Invalid Username or Password! Please try again.');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    currentUser = null;
    sessionStorage.removeItem('attendance_session_user');
    document.getElementById('appHeader').classList.add('hidden');
    document.getElementById('mainContainer').classList.add('hidden');
    document.getElementById('appSidebar').classList.add('hidden');
    document.getElementById('authWrapper').classList.remove('hidden');
    document.getElementById('loginForm').reset();
    document.querySelectorAll('.profile-menu.show').forEach(el => el.classList.remove('show'));
  });
}

function showDashboard() {
  document.getElementById('authWrapper').classList.add('hidden');
  document.getElementById('appHeader').classList.remove('hidden');
  document.getElementById('mainContainer').classList.remove('hidden');
  document.getElementById('appSidebar').classList.remove('hidden');

  document.getElementById('userNameDisplay').textContent = currentUser.name || currentUser.username;
  document.getElementById('userRoleDisplay').textContent = currentUser.role.toUpperCase();
  document.getElementById('menuUserName').textContent = currentUser.name || currentUser.username;
  document.getElementById('menuUserRole').textContent = currentUser.role.toUpperCase();
  document.getElementById('headerWelcomeText').textContent = `Welcome back, ${currentUser.name?.split(' ')[0] || currentUser.username}`;

  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    if (currentUser.role === 'admin') {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('markDate').value = today;

  renderAllViews();
}

// Navigation & Events
function initUIVisibilityGuard() {
  const authWrapper = document.getElementById('authWrapper');
  const appHeader = document.getElementById('appHeader');
  const mainContainer = document.getElementById('mainContainer');
  const appSidebar = document.getElementById('appSidebar');
  if (!authWrapper || !appHeader || !mainContainer || !appSidebar) return;

  const guard = () => {
    if (currentUser) {
      authWrapper.classList.add('hidden');
      appHeader.classList.remove('hidden');
      mainContainer.classList.remove('hidden');
      appSidebar.classList.remove('hidden');
    } else {
      authWrapper.classList.remove('hidden');
      appHeader.classList.add('hidden');
      mainContainer.classList.add('hidden');
      appSidebar.classList.add('hidden');
    }
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      const target = m.target;
      if (target.id === 'authWrapper' || target.id === 'appHeader' || target.id === 'mainContainer' || target.id === 'appSidebar') {
        if (currentUser && target.id === 'authWrapper' && !target.classList.contains('hidden')) {
          authWrapper.classList.add('hidden');
        }
        if (!currentUser && target.id !== 'authWrapper' && !target.classList.contains('hidden')) {
          appHeader.classList.add('hidden');
          mainContainer.classList.add('hidden');
          appSidebar.classList.add('hidden');
        }
      }
    });
  });

  observer.observe(authWrapper, { attributes: true, attributeFilter: ['class'] });
  observer.observe(appHeader, { attributes: true, attributeFilter: ['class'] });
  observer.observe(mainContainer, { attributes: true, attributeFilter: ['class'] });
  observer.observe(appSidebar, { attributes: true, attributeFilter: ['class'] });

  guard();
}

function initUIEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'logout') {
        document.getElementById('logoutBtn').click();
        return;
      }
      if (btn.dataset.tab) {
        switchToTab(btn.dataset.tab);
        renderVisibleTab();
      }
    });
  });

  document.querySelectorAll('[data-tab-quick]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tabQuick) {
        switchToTab(btn.dataset.tabQuick);
        renderVisibleTab();
      }
    });
  });

  document.getElementById('markTeamSelect').addEventListener('change', renderAttendanceMarkingForm);
  document.getElementById('markDate').addEventListener('change', renderAttendanceMarkingForm);

  document.getElementById('markAllPresentBtn').addEventListener('click', () => setAll5Hours('P'));
  document.getElementById('markAllAbsentBtn').addEventListener('click', () => setAll5Hours('A'));

  document.getElementById('saveAttendanceBtn').addEventListener('click', handleSaveAttendance);
  document.getElementById('unlockBtn').addEventListener('click', handleUnlockAttendance);

  // Calendar Date Filter and Category Filters in Viewing Area
  ['filterDate', 'filterTeam', 'filterDeptName', 'filterDept'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderRecordsTable);
  });

  document.getElementById('clearDateFilterBtn').addEventListener('click', () => {
    document.getElementById('filterDate').value = '';
    renderRecordsTable();
  });

  document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
  document.getElementById('studentSearchInput').addEventListener('input', renderStudentsTable);
  document.getElementById('clearStudentSearchBtn').addEventListener('click', () => {
    document.getElementById('studentSearchInput').value = '';
    renderStudentsTable();
  });

  document.getElementById('openAddStudentModalBtn').addEventListener('click', () => openStudentModal());
  document.getElementById('closeStudentModal').addEventListener('click', () => closeModal('studentModal'));
  document.getElementById('cancelStudentBtn').addEventListener('click', () => closeModal('studentModal'));
  document.getElementById('studentForm').addEventListener('submit', handleSaveStudent);

  document.getElementById('addDeptForm').addEventListener('submit', handleAddDept);
  document.getElementById('addSectionForm').addEventListener('submit', handleAddSection);
  document.getElementById('addTeamForm').addEventListener('submit', handleAddTeam);

  document.getElementById('openAddUserModalBtn').addEventListener('click', () => openUserModal());
  document.getElementById('closeUserModal').addEventListener('click', () => closeModal('userModal'));
  document.getElementById('cancelUserBtn').addEventListener('click', () => closeModal('userModal'));
  document.getElementById('userForm').addEventListener('submit', handleSaveUser);

  const profileTrigger = document.getElementById('profileMenuTrigger');
  if (profileTrigger) {
    profileTrigger.addEventListener('click', () => {
      const menu = document.getElementById('profileMenu');
      if (menu) {
        const isOpen = menu.classList.contains('show');
        document.querySelectorAll('.profile-menu.show').forEach(el => el.classList.remove('show'));
        if (!isOpen) menu.classList.add('show');
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.profile-menu-wrapper')) {
      document.querySelectorAll('.profile-menu.show').forEach(el => el.classList.remove('show'));
    }
  });

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => renderSettingsTab());
    window.addEventListener('offline', () => renderSettingsTab());
  }

  const toggleOfflineModeBtn = document.getElementById('toggleOfflineModeBtn');
  if (toggleOfflineModeBtn) {
    toggleOfflineModeBtn.addEventListener('click', () => {
      const currentValue = localStorage.getItem(OFFLINE_MODE_KEY) === 'true';
      localStorage.setItem(OFFLINE_MODE_KEY, String(!currentValue));
      renderSettingsTab();
    });
  }

  const refreshCacheBtn = document.getElementById('refreshCacheBtn');
  if (refreshCacheBtn) {
    refreshCacheBtn.addEventListener('click', async () => {
      await loadAppData();
      renderAllViews();
      renderSettingsTab();
    });
  }

  const resetDemoDataBtn = document.getElementById('resetDemoDataBtn');
  if (resetDemoDataBtn) {
    resetDemoDataBtn.addEventListener('click', async () => {
      if (!confirm('Reset all local demo data and return to the default sample records?')) return;
      appData = JSON.parse(JSON.stringify(defaultAppData));
      await saveAppData();
      renderAllViews();
      renderSettingsTab();
    });
  }

  const signOutFromSettingsBtn = document.getElementById('signOutFromSettingsBtn');
  if (signOutFromSettingsBtn) {
    signOutFromSettingsBtn.addEventListener('click', () => {
      document.getElementById('logoutBtn').click();
    });
  }
}

// Keep the new premium shell and legacy sections in sync without changing app behavior.
function switchToTab(tabId) {
  if (!tabId) return;
  currentTabId = tabId;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  const targetSection = document.getElementById(tabId);
  if (targetSection) targetSection.classList.remove('hidden');

  const labelEl = document.getElementById('headerBreadcrumbCurrent');
  if (labelEl) {
    const activeLabel = targetBtn ? targetBtn.querySelector('.nav-label')?.textContent || 'Dashboard' : 'Dashboard';
    labelEl.textContent = activeLabel;
  }
}

function renderVisibleTab() {
  if (currentTabId === 'dashboardTab') {
    renderDashboardOverview();
  } else if (currentTabId === 'markTab') {
    renderAttendanceMarkingForm();
  } else if (currentTabId === 'recordsTab') {
    renderRecordsTable();
  } else if (currentTabId === 'studentsTab') {
    renderStudentsTable();
  } else if (currentTabId === 'deptsTab') {
    renderDeptsTags();
  } else if (currentTabId === 'sectionsTab') {
    renderSectionsTags();
  } else if (currentTabId === 'teamsTab') {
    renderTeamsTags();
  } else if (currentTabId === 'usersTab') {
    renderUsersTable();
  } else if (currentTabId === 'reportsTab') {
    renderReportsTab();
  } else if (currentTabId === 'settingsTab') {
    renderSettingsTab();
  }
}

function renderAllViews() {
  populateDropdowns();
  renderDashboardOverview();
  renderAttendanceMarkingForm();
  renderRecordsTable();
  renderStudentsTable();
  renderDeptsTags();
  renderSectionsTags();
  renderTeamsTags();
  renderUsersTable();
  renderReportsTab();
  renderSettingsTab();
  renderVisibleTab();
}

function renderReportsTab() {
  const { rowList, totalHoursCount, presentHoursCount, absentHoursCount } = getSortedFilteredAttendanceRows();
  const rate = totalHoursCount > 0 ? ((presentHoursCount / totalHoursCount) * 100).toFixed(1) + '%' : '0%';

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('reportTotalSessions', rowList.length);
  setText('reportPresentHours', presentHoursCount);
  setText('reportAbsentHours', absentHoursCount);
  setText('reportRate', rate);
}

function renderSettingsTab() {
  const roleLabel = currentUser?.role ? currentUser.role.toUpperCase() : 'GUEST';
  const onlineStatus = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
  const offlineForced = localStorage.getItem(OFFLINE_MODE_KEY) === 'true';
  let syncText = 'Online sync active';
  if (offlineForced) {
    syncText = 'Offline cache active';
  } else if (!onlineStatus) {
    syncText = 'No network connection';
  } else if (!firestoreSyncHealthy) {
    syncText = 'Cloud sync unavailable';
  }

  const roleEl = document.getElementById('settingsRoleLabel');
  if (roleEl) roleEl.textContent = roleLabel;

  const syncEl = document.getElementById('settingsSyncStatus');
  if (syncEl) syncEl.textContent = syncText;

  const toggleOfflineModeBtn = document.getElementById('toggleOfflineModeBtn');
  if (toggleOfflineModeBtn) {
    toggleOfflineModeBtn.textContent = offlineForced ? 'Enable Live Sync' : 'Switch to Offline Cache';
  }

  const connectionBadge = document.getElementById('settingsConnectionBadge');
  if (connectionBadge) connectionBadge.textContent = syncText;
}

// Populate the redesigned dashboard cards from the existing appData structure.
function renderDashboardOverview() {
  const studentsCount = appData.students?.length || 0;
  const teamsCount = appData.teams?.length || 0;
  const departmentsCount = appData.departments?.length || 0;
  const today = new Date().toISOString().split('T')[0];
  const todayRecord = appData.attendance?.find(item => item.date === today);

  let presentCount = 0;
  let absentCount = 0;
  if (todayRecord?.studentAttendanceMap) {
    Object.values(todayRecord.studentAttendanceMap).forEach(entry => {
      if (entry) {
        [entry.h1, entry.h2, entry.h3, entry.h4, entry.h5].forEach(hour => {
          if (hour === 'P') presentCount += 1;
          else absentCount += 1;
        });
      }
    });
  }

  const totalHours = presentCount + absentCount;
  const rate = totalHours > 0 ? `${Math.round((presentCount / totalHours) * 100)}%` : '0%';

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('dashboardStudentsCount', studentsCount);
  setText('dashboardPresentCount', presentCount);
  setText('dashboardAbsentCount', absentCount);
  setText('dashboardTeamsCount', teamsCount);
  setText('dashboardDepartmentsCount', departmentsCount);
  setText('dashboardRateCount', rate);
  setText('dashboardAttendanceRate', rate);

  const activityList = document.getElementById('recentActivityList');
  if (activityList) {
    const recentItems = [];
    if (appData.attendance?.length) {
      const latest = [...appData.attendance].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))[0];
      if (latest) {
        recentItems.push(`<li><strong>${latest.teamId}</strong> · ${latest.date} · Saved by ${latest.markedBy || 'system'}</li>`);
      }
    }
    recentItems.push(`<li><strong>${studentsCount}</strong> students currently registered in the portal.</li>`);
    recentItems.push(`<li><strong>${departmentsCount}</strong> departments and <strong>${teamsCount}</strong> teams are active.</li>`);
    activityList.innerHTML = recentItems.join('');
  }
}

function populateDropdowns() {
  const markTeamSelect = document.getElementById('markTeamSelect');
  markTeamSelect.innerHTML = appData.teams.map(t => `<option value="${t}">${t}</option>`).join('');

  const filterTeam = document.getElementById('filterTeam');
  filterTeam.innerHTML = `<option value="ALL">All Teams</option>` + appData.teams.map(t => `<option value="${t}">${t}</option>`).join('');

  const filterDeptName = document.getElementById('filterDeptName');
  filterDeptName.innerHTML = `<option value="ALL">All Department Names</option>` + appData.departments.map(d => `<option value="${d}">${d}</option>`).join('');

  const studentDeptName = document.getElementById('studentDeptName');
  studentDeptName.innerHTML = appData.departments.map(d => `<option value="${d}">${d}</option>`).join('');

  const studentSection = document.getElementById('studentSection');
  studentSection.innerHTML = appData.sections.map(s => `<option value="${s}">${s}</option>`).join('');

  const studentTeam = document.getElementById('studentTeam');
  studentTeam.innerHTML = appData.teams.map(t => `<option value="${t}">${t}</option>`).join('');
}

// 5-Hour Attendance Marking Form
function renderAttendanceMarkingForm() {
  const teamId = document.getElementById('markTeamSelect').value;
  const date = document.getElementById('markDate').value;

  const tbody = document.getElementById('attendanceMarkTbody');
  tbody.innerHTML = '';

  if (!teamId || !date) return;

  const teamStudents = appData.students.filter(s => s.teamId === teamId);
  document.getElementById('teamStudentCountTitle').textContent = `Team Students (${teamStudents.length})`;

  const existingRecord = appData.attendance.find(a => a.teamId === teamId && a.date === date);
  const isLocked = existingRecord && existingRecord.locked && currentUser.role === 'incharge';

  const markLockBanner = document.getElementById('markLockBanner');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const batchActionBtns = document.getElementById('batchActionBtns');

  if (existingRecord && existingRecord.locked) {
    markLockBanner.classList.remove('hidden');
  } else {
    markLockBanner.classList.add('hidden');
  }

  if (isLocked) {
    saveAttendanceBtn.disabled = true;
    saveAttendanceBtn.style.opacity = '0.5';
    batchActionBtns.classList.add('hidden');
  } else {
    saveAttendanceBtn.disabled = false;
    saveAttendanceBtn.style.opacity = '1';
    batchActionBtns.classList.remove('hidden');
  }

  if (teamStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">No students assigned to this Team.</td></tr>`;
    return;
  }

  teamStudents.forEach(s => {
    let h1 = 'P', h2 = 'P', h3 = 'P', h4 = 'P', h5 = 'P';
    if (existingRecord && existingRecord.studentAttendanceMap && existingRecord.studentAttendanceMap[s.id]) {
      const rec = existingRecord.studentAttendanceMap[s.id];
      h1 = rec.h1 || 'P'; h2 = rec.h2 || 'P'; h3 = rec.h3 || 'P'; h4 = rec.h4 || 'P'; h5 = rec.h5 || 'P';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Roll No"><strong>${s.rollNumber}</strong></td>
      <td data-label="Register No">${s.registerNumber}</td>
      <td data-label="Student Name">${s.name}</td>
      <td data-label="Department">${s.deptName || 'Computer Science'}</td>
      <td data-label="Category"><span class="badge ${s.department === 'Aided' ? 'badge-aided' : 'badge-self'}">${s.department}</span></td>
      
      <td data-label="H1" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h1 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="1" ${isLocked ? 'disabled' : ''}>${h1}</button></td>
      <td data-label="H2" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h2 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="2" ${isLocked ? 'disabled' : ''}>${h2}</button></td>
      <td data-label="H3" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h3 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="3" ${isLocked ? 'disabled' : ''}>${h3}</button></td>
      <td data-label="H4" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h4 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="4" ${isLocked ? 'disabled' : ''}>${h4}</button></td>
      <td data-label="H5" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h5 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="5" ${isLocked ? 'disabled' : ''}>${h5}</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function togglePABtn(btn) {
  if (btn.disabled) return;
  if (btn.textContent === 'P') {
    btn.textContent = 'A';
    btn.classList.remove('present');
    btn.classList.add('absent');
  } else {
    btn.textContent = 'P';
    btn.classList.remove('absent');
    btn.classList.add('present');
  }
}

function setAll5Hours(val) {
  document.querySelectorAll('#attendanceMarkTbody .pa-toggle-btn').forEach(btn => {
    if (!btn.disabled) {
      btn.textContent = val;
      if (val === 'P') {
        btn.classList.remove('absent'); btn.classList.add('present');
      } else {
        btn.classList.remove('present'); btn.classList.add('absent');
      }
    }
  });
}

async function handleSaveAttendance() {
  const teamId = document.getElementById('markTeamSelect').value;
  const date = document.getElementById('markDate').value;
  const teamStudents = appData.students.filter(s => s.teamId === teamId);

  if (teamStudents.length === 0) {
    alert('No students to mark attendance for!');
    return;
  }

  const studentAttendanceMap = {};
  teamStudents.forEach(s => {
    const btnH1 = document.querySelector(`.pa-toggle-btn[data-student="${s.id}"][data-hour="1"]`);
    const btnH2 = document.querySelector(`.pa-toggle-btn[data-student="${s.id}"][data-hour="2"]`);
    const btnH3 = document.querySelector(`.pa-toggle-btn[data-student="${s.id}"][data-hour="3"]`);
    const btnH4 = document.querySelector(`.pa-toggle-btn[data-student="${s.id}"][data-hour="4"]`);
    const btnH5 = document.querySelector(`.pa-toggle-btn[data-student="${s.id}"][data-hour="5"]`);

    studentAttendanceMap[s.id] = {
      h1: btnH1 ? btnH1.textContent : 'P',
      h2: btnH2 ? btnH2.textContent : 'P',
      h3: btnH3 ? btnH3.textContent : 'P',
      h4: btnH4 ? btnH4.textContent : 'P',
      h5: btnH5 ? btnH5.textContent : 'P'
    };
  });

  const index = appData.attendance.findIndex(a => a.teamId === teamId && a.date === date);
  const newRecord = {
    id: index >= 0 ? appData.attendance[index].id : 'att_' + Date.now(),
    teamId, date, studentAttendanceMap,
    markedBy: currentUser.name || currentUser.username,
    locked: true, timestamp: new Date().toISOString()
  };

  if (index >= 0) appData.attendance[index] = newRecord;
  else appData.attendance.push(newRecord);

  await saveAppData();
  alert(`5-Hour attendance saved and locked for ${teamId} (${date})!`);
  renderAttendanceMarkingForm();
  renderRecordsTable();
}

async function handleUnlockAttendance() {
  if (currentUser.role !== 'admin') return;
  const teamId = document.getElementById('markTeamSelect').value;
  const date = document.getElementById('markDate').value;
  const record = appData.attendance.find(a => a.teamId === teamId && a.date === date);

  if (record) {
    record.locked = false;
    await saveAppData();
    alert('Attendance unlocked for editing by Admin!');
    renderAttendanceMarkingForm();
  }
}

// Attendance Records Viewing Area (With Calendar Date Filtering)
function getAttendanceSortValue(att) {
  if (att?.timestamp) {
    const parsed = Date.parse(att.timestamp);
    return { hasTimestamp: true, value: Number.isNaN(parsed) ? att.timestamp : parsed };
  }

  const parsedDate = Date.parse(`${att?.date || ''}T00:00:00.000Z`);
  return { hasTimestamp: false, value: Number.isNaN(parsedDate) ? `${att?.date || ''}` : parsedDate };
}

function getSortedAttendanceRecords() {
  return appData.attendance
    .map((att, index) => ({ att, index }))
    .sort((left, right) => {
      const leftSort = getAttendanceSortValue(left.att);
      const rightSort = getAttendanceSortValue(right.att);

      if (leftSort.hasTimestamp !== rightSort.hasTimestamp) {
        return leftSort.hasTimestamp ? -1 : 1;
      }

      if (leftSort.hasTimestamp && rightSort.hasTimestamp) {
        const timeDiff = rightSort.value - leftSort.value;
        if (timeDiff !== 0) {
          return timeDiff;
        }
      }

      if (!leftSort.hasTimestamp && !rightSort.hasTimestamp) {
        const dateDiff = rightSort.value - leftSort.value;
        if (dateDiff !== 0) {
          return dateDiff;
        }
      }

      return left.index - right.index;
    })
    .map(({ att }) => att);
}

function getSortedFilteredAttendanceRows() {
  const filterDateVal = document.getElementById('filterDate').value;
  const filterTeamVal = document.getElementById('filterTeam').value;
  const filterDeptNameVal = document.getElementById('filterDeptName').value;
  const filterDeptVal = document.getElementById('filterDept').value;

  let rowList = [], totalHoursCount = 0, presentHoursCount = 0, absentHoursCount = 0;

  getSortedAttendanceRecords().forEach(att => {
    if (!att.studentAttendanceMap) return;

    Object.keys(att.studentAttendanceMap).forEach(studentId => {
      const student = appData.students.find(s => s.id === studentId);
      if (!student) return;
      const hours = att.studentAttendanceMap[studentId];

      if (filterDateVal && att.date !== filterDateVal) return;
      if (filterTeamVal !== 'ALL' && att.teamId !== filterTeamVal) return;
      if (filterDeptNameVal !== 'ALL' && student.deptName !== filterDeptNameVal) return;
      if (filterDeptVal !== 'ALL' && student.department !== filterDeptVal) return;

      [hours.h1, hours.h2, hours.h3, hours.h4, hours.h5].forEach(st => {
        totalHoursCount++;
        if (st === 'P') presentHoursCount++; else absentHoursCount++;
      });

      rowList.push({
        date: att.date,
        teamName: att.teamId,
        studentName: student.name,
        rollNumber: student.rollNumber,
        registerNumber: student.registerNumber,
        mobile: student.mobile,
        deptName: student.deptName || 'N/A',
        department: student.department,
        section: student.section,
        h1: hours.h1 || 'P',
        h2: hours.h2 || 'P',
        h3: hours.h3 || 'P',
        h4: hours.h4 || 'P',
        h5: hours.h5 || 'P',
        markedBy: att.markedBy,
        timestamp: att.timestamp,
        sortDate: att.date
      });
    });
  });

  return { rowList, totalHoursCount, presentHoursCount, absentHoursCount };
}

globalThis.getSortedFilteredAttendanceRows = getSortedFilteredAttendanceRows;

function renderRecordsTable() {
  const tbody = document.getElementById('recordsTbody');
  tbody.innerHTML = '';

  const { rowList, totalHoursCount, presentHoursCount, absentHoursCount } = getSortedFilteredAttendanceRows();
  const rate = totalHoursCount > 0 ? ((presentHoursCount / totalHoursCount) * 100).toFixed(1) + '%' : '0%';

  document.getElementById('statTotalRecs').textContent = rowList.length;
  document.getElementById('statPresentRecs').textContent = presentHoursCount;
  document.getElementById('statAbsentRecs').textContent = absentHoursCount;
  document.getElementById('statRate').textContent = rate;

  if (rowList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; color: var(--text-muted); padding: 2rem;">No attendance records found matching selected date & filters.</td></tr>`;
    return;
  }

  rowList.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Date">${r.date}</td>
      <td data-label="Team"><strong>${r.teamName}</strong></td>
      <td data-label="Student Name">${r.studentName}</td>
      <td data-label="Roll No">${r.rollNumber}</td>
      <td data-label="Register No">${r.registerNumber}</td>
      <td data-label="Dept Name">${r.deptName}</td>
      <td data-label="Category"><span class="badge ${r.department === 'Aided' ? 'badge-aided' : 'badge-self'}">${r.department}</span></td>
      <td data-label="H1" style="text-align: center;"><span class="pa-badge ${r.h1 === 'P' ? 'present' : 'absent'}">${r.h1}</span></td>
      <td data-label="H2" style="text-align: center;"><span class="pa-badge ${r.h2 === 'P' ? 'present' : 'absent'}">${r.h2}</span></td>
      <td data-label="H3" style="text-align: center;"><span class="pa-badge ${r.h3 === 'P' ? 'present' : 'absent'}">${r.h3}</span></td>
      <td data-label="H4" style="text-align: center;"><span class="pa-badge ${r.h4 === 'P' ? 'present' : 'absent'}">${r.h4}</span></td>
      <td data-label="H5" style="text-align: center;"><span class="pa-badge ${r.h5 === 'P' ? 'present' : 'absent'}">${r.h5}</span></td>
      <td data-label="Marked By">${r.markedBy}</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportToExcel() {
  const filterDateVal = document.getElementById('filterDate').value;
  const filterTeamVal = document.getElementById('filterTeam').value;
  const filterDeptNameVal = document.getElementById('filterDeptName').value;
  const filterDeptVal = document.getElementById('filterDept').value;
  const { rowList } = getSortedFilteredAttendanceRows();
  const exportData = rowList.map(row => ({
    'Date': row.date,
    'Team': row.teamName,
    'Student Name': row.studentName,
    'Roll Number': row.rollNumber,
    'Register Number': row.registerNumber,
    'Mobile Number': row.mobile,
    'Department Name': row.deptName,
    'Department Category': row.department,
    'Section': row.section,
    'Hour 1 (H1)': row.h1,
    'Hour 2 (H2)': row.h2,
    'Hour 3 (H3)': row.h3,
    'Hour 4 (H4)': row.h4,
    'Hour 5 (H5)': row.h5,
    'Marked By': row.markedBy
  }));

  if (exportData.length === 0) {
    alert('No data available to export with current date & filters!');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "5_Hour_Attendance_Report");

  worksheet['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
    { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 18 }
  ];

  const fileName = `5_Hour_Attendance_Report_${filterDateVal || new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

// Student Directory
function renderStudentsTable() {
  const searchQuery = document.getElementById('studentSearchInput').value.toLowerCase();
  const tbody = document.getElementById('studentsTbody');
  const clearSearchBtn = document.getElementById('clearStudentSearchBtn');
  if (clearSearchBtn) {
    clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
  }
  tbody.innerHTML = '';

  const filtered = appData.students.filter(s => 
    s.name.toLowerCase().includes(searchQuery) ||
    s.rollNumber.toLowerCase().includes(searchQuery) ||
    s.registerNumber.toLowerCase().includes(searchQuery) ||
    (s.deptName && s.deptName.toLowerCase().includes(searchQuery))
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">No student records found.</td></tr>`;
    return;
  }

  filtered.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Roll No"><strong>${s.rollNumber}</strong></td>
      <td data-label="Register No">${s.registerNumber}</td>
      <td data-label="Name">${s.name}</td>
      <td data-label="Mobile">${s.mobile}</td>
      <td data-label="Dept Name">${s.deptName || 'Computer Science'}</td>
      <td data-label="Category"><span class="badge ${s.department === 'Aided' ? 'badge-aided' : 'badge-self'}">${s.department}</span></td>
      <td data-label="Section">${s.section}</td>
      <td data-label="Team"><span style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">${s.teamId || 'Team Alpha'}</span></td>
      <td data-label="Actions" class="admin-only">
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="openStudentModal('${s.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s.id}')">🗑️ Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (currentUser.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  }
}

function openStudentModal(studentId = null) {
  populateDropdowns();
  const form = document.getElementById('studentForm');
  form.reset();

  if (studentId) {
    const s = appData.students.find(x => x.id === studentId);
    if (s) {
      document.getElementById('studentModalTitle').textContent = 'Edit Student Data';
      document.getElementById('studentEditId').value = s.id;
      document.getElementById('studentName').value = s.name;
      document.getElementById('studentRoll').value = s.rollNumber;
      document.getElementById('studentRegister').value = s.registerNumber;
      document.getElementById('studentMobile').value = s.mobile;
      document.getElementById('studentDeptName').value = s.deptName || appData.departments[0];
      document.getElementById('studentDept').value = s.department;
      document.getElementById('studentSection').value = s.section;
      document.getElementById('studentTeam').value = s.teamId || appData.teams[0];
    }
  } else {
    document.getElementById('studentModalTitle').textContent = 'Add New Student';
    document.getElementById('studentEditId').value = '';
  }

  document.getElementById('studentModal').classList.remove('hidden');
}

async function handleSaveStudent(e) {
  e.preventDefault();
  const id = document.getElementById('studentEditId').value;
  const name = document.getElementById('studentName').value.trim();
  const rollNumber = document.getElementById('studentRoll').value.trim();
  const registerNumber = document.getElementById('studentRegister').value.trim();
  const mobile = document.getElementById('studentMobile').value.trim();
  const deptName = document.getElementById('studentDeptName').value;
  const department = document.getElementById('studentDept').value;
  const section = document.getElementById('studentSection').value;
  const teamId = document.getElementById('studentTeam').value;

  const studentData = { id: id || 's_' + Date.now(), name, rollNumber, registerNumber, mobile, deptName, department, section, teamId };

  if (id) {
    const idx = appData.students.findIndex(s => s.id === id);
    if (idx >= 0) appData.students[idx] = studentData;
  } else {
    appData.students.push(studentData);
  }

  await saveAppData();
  closeModal('studentModal');
  renderStudentsTable();
  renderDashboardOverview();
  renderReportsTab();
  renderSettingsTab();
  renderVisibleTab();
}

async function deleteStudent(studentId) {
  if (currentUser.role !== 'admin') return;
  if (confirm('Are you sure you want to delete this student?')) {
    appData.students = appData.students.filter(s => s.id !== studentId);
    await saveAppData();
    renderAllViews();
  }
}

// Departments Management
function renderDeptsTags() {
  const container = document.getElementById('deptsTagList');
  container.innerHTML = appData.departments.map(dept => `
    <div class="tag-item">
      <span>🏢 ${dept}</span>
      <button class="tag-remove" onclick="removeDept('${dept}')">&times;</button>
    </div>
  `).join('');
}

async function handleAddDept(e) {
  e.preventDefault();
  const input = document.getElementById('newDeptInput');
  const name = input.value.trim();
  if (name && !appData.departments.includes(name)) {
    appData.departments.push(name);
    await saveAppData();
    input.value = '';
    populateDropdowns();
    renderDeptsTags();
    renderStudentsTable();
    renderDashboardOverview();
    renderVisibleTab();
  }
}

async function removeDept(deptName) {
  if (currentUser.role !== 'admin') return;
  if (confirm(`Remove Department "${deptName}"?`)) {
    appData.departments = appData.departments.filter(d => d !== deptName);
    await saveAppData();
    populateDropdowns();
    renderDeptsTags();
    renderStudentsTable();
    renderDashboardOverview();
    renderVisibleTab();
  }
}

// Sections Management
function renderSectionsTags() {
  const container = document.getElementById('sectionsTagList');
  container.innerHTML = appData.sections.map(sec => `
    <div class="tag-item">
      <span>🏷️ ${sec}</span>
      <button class="tag-remove" onclick="removeSection('${sec}')">&times;</button>
    </div>
  `).join('');
}

async function handleAddSection(e) {
  e.preventDefault();
  const input = document.getElementById('newSectionInput');
  const name = input.value.trim();
  if (name && !appData.sections.includes(name)) {
    appData.sections.push(name);
    await saveAppData();
    input.value = '';
    populateDropdowns();
    renderSectionsTags();
    renderVisibleTab();
  }
}

async function removeSection(sectionName) {
  if (currentUser.role !== 'admin') return;
  if (confirm(`Remove Section "${sectionName}"?`)) {
    appData.sections = appData.sections.filter(s => s !== sectionName);
    await saveAppData();
    populateDropdowns();
    renderSectionsTags();
    renderVisibleTab();
  }
}

// Teams Management
function renderTeamsTags() {
  const container = document.getElementById('teamsTagList');
  container.innerHTML = appData.teams.map(t => `
    <div class="tag-item">
      <span>👥 ${t}</span>
      <button class="tag-remove" onclick="removeTeam('${t}')">&times;</button>
    </div>
  `).join('');
}

async function handleAddTeam(e) {
  e.preventDefault();
  const input = document.getElementById('newTeamInput');
  const tName = input.value.trim();
  if (tName && !appData.teams.includes(tName)) {
    appData.teams.push(tName);
    await saveAppData();
    input.value = '';
    populateDropdowns();
    renderTeamsTags();
    renderVisibleTab();
  }
}

async function removeTeam(tName) {
  if (currentUser.role !== 'admin') return;
  if (confirm(`Remove Team "${tName}"?`)) {
    appData.teams = appData.teams.filter(t => t !== tName);
    await saveAppData();
    populateDropdowns();
    renderTeamsTags();
    renderStudentsTable();
    renderDashboardOverview();
    renderVisibleTab();
  }
}

// User Management (Admin Edit Username / Password at Any Time)
function renderUsersTable() {
  const tbody = document.getElementById('usersTbody');
  tbody.innerHTML = appData.users.map(u => `
    <tr>
      <td data-label="User ID"><strong>${u.username}</strong></td>
      <td data-label="Full Name">${u.name || u.username}</td>
      <td data-label="Role"><span class="user-role-tag" style="background: ${u.role === 'admin' ? 'var(--purple)' : 'var(--primary)'};">${u.role.toUpperCase()}</span></td>
      <td data-label="Password">
        <div class="password-wrapper" style="max-width: 180px;">
          <input type="password" value="${u.password}" readonly class="input-control" style="padding: 0.3rem 0.6rem; font-size: 0.85rem;" />
          <button type="button" class="eye-btn" onclick="toggleTablePassword(this)">👁️</button>
        </div>
      </td>
      <td data-label="Actions">
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.id}')">✏️ Edit User/PW</button>
          <button class="btn btn-danger btn-sm" onclick="removeUser('${u.id}')">🗑️ Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function toggleTablePassword(btn) {
  const input = btn.previousElementSibling;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.textContent = isPassword ? '🙈' : '👁️';
}

function openUserModal(userId = null) {
  const form = document.getElementById('userForm');
  form.reset();

  if (userId) {
    const u = appData.users.find(x => x.id === userId);
    if (u) {
      document.getElementById('userModalTitle').textContent = 'Edit User ID & Password';
      document.getElementById('userEditId').value = u.id;
      document.getElementById('newUserName').value = u.name || '';
      document.getElementById('newUserUsername').value = u.username;
      document.getElementById('newUserPassword').value = u.password;
      document.getElementById('newUserRole').value = u.role;
    }
  } else {
    document.getElementById('userModalTitle').textContent = 'Add New User Account';
    document.getElementById('userEditId').value = '';
  }

  document.getElementById('userModal').classList.remove('hidden');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('userEditId').value;
  const name = document.getElementById('newUserName').value.trim();
  const username = document.getElementById('newUserUsername').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;

  const existing = appData.users.find(u => u.username === username && u.id !== id);
  if (existing) {
    alert(`Username "${username}" already exists! Choose a different Username / User ID.`);
    return;
  }

  if (id) {
    const idx = appData.users.findIndex(u => u.id === id);
    if (idx >= 0) {
      appData.users[idx] = { ...appData.users[idx], name, username, password, role };
      if (currentUser.id === id) {
        currentUser = appData.users[idx];
        sessionStorage.setItem('attendance_session_user', JSON.stringify(currentUser));
        document.getElementById('userNameDisplay').textContent = currentUser.name || currentUser.username;
        document.getElementById('userRoleDisplay').textContent = currentUser.role.toUpperCase();
      }
    }
    alert(`User account "${username}" updated successfully!`);
  } else {
    appData.users.push({ id: 'u_' + Date.now(), name, username, password, role });
    alert(`User account "${username}" successfully created!`);
  }

  await saveAppData();
  closeModal('userModal');
  renderUsersTable();
  renderSettingsTab();
  renderVisibleTab();
}

async function removeUser(userId) {
  if (currentUser.role !== 'admin') return;
  const targetUser = appData.users.find(u => u.id === userId);
  if (!targetUser) return;

  if (confirm(`Are you sure you want to remove user account "${targetUser.username}" (${targetUser.role.toUpperCase()})?`)) {
    appData.users = appData.users.filter(u => u.id !== userId);
    await saveAppData();
    renderAllViews();

    if (currentUser.id === userId) {
      alert('You have deleted your own account. You will now be logged out.');
      document.getElementById('logoutBtn').click();
    } else {
      alert(`User account "${targetUser.username}" removed.`);
    }
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}
