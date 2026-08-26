// Complete Application Logic Connected to Firebase Firestore for the configured app project

// Application State
const defaultAppData = {
  users: [
    { id: "u1", username: "admin", password: "admin123", role: "admin", name: "System Administrator" },
    { id: "u2", username: "incharge1", password: "user123", role: "incharge", name: "Student Incharge 1", assignedTeamIds: ["Team Alpha"] }
  ],
  departments: ["Computer Science", "Information Technology", "Electronics & Comm", "Commerce", "Mathematics"],
  departments: ["Computer Science","Commerce","Mathematics","ENGLISH","ARABIC","BOTANY","CHEMISTRY","ECONOMICS","HISTORY","PHYSICS","TAMIL","ZOOLOGY","AI&ML","BBA-AVI","BBA","BCA","BIOTECH","HOTEL MANAGEMENT","IT&CS","INTERNATIONAL & FINANCE","VISCOM","B.com IF"],
  years: ["First Year", "Second Year", "Third Year"],
  sections: ["Section A", "Section B", "Section C", "Section D"],
  teams: ["Team Alpha", "Team Beta", "Team Gamma", "Team Delta"],
  students: [
    { id: "s1", name: "John Doe", rollNumber: "21CS01", registerNumber: "910021104001", mobile: "9876543210", department: "Aided", deptName: "Computer Science", year: "First Year", section: "Section A", teamId: "Team Alpha" },
    { id: "s2", name: "Jane Smith", rollNumber: "21CS02", registerNumber: "910021104002", mobile: "9876543211", department: "Self-Finance", deptName: "Information Technology", year: "Second Year", section: "Section B", teamId: "Team Alpha" },
    { id: "s3", name: "Robert Brown", rollNumber: "21CS03", registerNumber: "910021104003", mobile: "9876543212", department: "Aided", deptName: "Commerce", year: "Third Year", section: "Section A", teamId: "Team Beta" },
    { id: "s4", name: "Emily Davis", rollNumber: "21CS04", registerNumber: "910021104004", mobile: "9876543213", department: "Self-Finance", deptName: "Mathematics", year: "Fourth Year", section: "Section C", teamId: "Team Gamma" }
  ],
  attendance: [],
  notifications: []
};

let appData = JSON.parse(JSON.stringify(defaultAppData));
let currentUser = null;
let currentTabId = 'dashboardTab';
// selected IDs for export
globalThis.selectedExportStudents = new Set();
globalThis.selectedExportRecords = new Set();

Object.defineProperty(globalThis, 'currentUser', {
  configurable: true,
  enumerable: true,
  get() {
    return currentUser;
  },
  set(value) {
    currentUser = value;
  }
});
let firestoreDb = null;
let firestoreListenerRegistered = false;
let firestoreListenerUnsubscribe = null;
let firestoreSyncHealthy = false;
let lastFirestoreError = null;
const API_TIMEOUT_MS = 8000;
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
    years: Array.isArray(source?.years) && source.years.length ? source.years : defaultAppData.years,
    sections: Array.isArray(source?.sections) && source.sections.length ? source.sections : defaultAppData.sections,
    teams: Array.isArray(source?.teams) && source.teams.length ? source.teams : defaultAppData.teams,
    students: Array.isArray(source?.students) && source.students.length ? source.students : defaultAppData.students,
    attendance: Array.isArray(source?.attendance) ? source.attendance : defaultAppData.attendance,
    notifications: Array.isArray(source?.notifications) ? source.notifications : defaultAppData.notifications,
  };

  // preserve any extra properties without losing defaults
  return { ...defaultAppData, ...merged, ...source };
}

// Initialize Firestore
function getFirestoreDocRef() {
  if (!firestoreDb) return null;
  return firestoreDb.collection('attendance_master_data').doc('appData');
}

function initFirebase() {
  if (window.__attendanceFirebaseInitialized) return;
  window.__attendanceFirebaseInitialized = true;

  if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0) {
    console.warn('Firebase SDK is not available. Firestore data sync is disabled.');
    return;
  }

  try {
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

function renderExportPreview(previewRows, selectedCols, headers) {
  const container = document.getElementById('exportPreviewContainer');
  if (!container) return;
  if (!previewRows || !previewRows.length) {
    container.innerHTML = '<div style="color:var(--text-muted)">No rows to preview.</div>';
    return;
  }
  // Group previewRows by Finance Type (department)
  const groups = {};
  previewRows.forEach(r => {
    const key = (r.department || 'Unspecified').toString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  // render groups
  const parts = [];
  Object.keys(groups).forEach(groupName => {
    const grp = groups[groupName];
    parts.push(`<div style="margin-bottom:8px;"><strong>Finance Type: ${groupName}</strong></div>`);
    const thead = `<thead><tr>${headers.map(h => `<th style="padding:6px 8px; border-bottom:1px solid #eee; text-align:left">${h}</th>`).join('')}</tr></thead>`;
    const rowsHtml = grp.map(r => `<tr>${selectedCols.map(k => `<td style="padding:6px 8px; border-bottom:1px solid #f5f5f5">${(r[k] == null || r[k] === '') ? '' : String(Array.isArray(r[k]) ? r[k].join(', ') : r[k])}</td>`).join('')}</tr>`).join('');
    parts.push(`<table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-bottom:12px">${thead}<tbody>${rowsHtml}</tbody></table>`);
  });
  container.innerHTML = parts.join('');
}

async function exportToWord(rows, selectedCols, headers, filename, filtersText) {
  if (!window.docx) {
    alert('Word export library not available.');
    return;
  }
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } = window.docx;
  const doc = new Document();

    // include filters metadata and export timestamp/total at top
    const exportedAt = new Date().toISOString();
    const metaChildren = [];
    if (filtersText) metaChildren.push(new Paragraph({ children: [new TextRun({ text: `Filters: ${filtersText}`, bold: false })] }));
    metaChildren.push(new Paragraph({ children: [new TextRun({ text: `Exported: ${exportedAt}`, bold: false })] }));
    metaChildren.push(new Paragraph({ children: [new TextRun({ text: `Total Records: ${rows.length}`, bold: false })] }));
    doc.addSection({ children: metaChildren });

  // group rows by department (finance type)
  const groups = {};
  rows.forEach(r => {
    const key = (r.department || 'Unspecified').toString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  Object.keys(groups).forEach(groupName => {
    const grp = groups[groupName];
    // add heading
    doc.addSection({ children: [new Paragraph({ children: [new TextRun({ text: `Finance Type: ${groupName}`, bold: true })] })] });
    // build table rows: header + data rows
    const tableRows = [];
    // header
    tableRows.push(new TableRow({ children: headers.map(h => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }));
    grp.forEach(r => {
      const cells = selectedCols.map(k => new TableCell({ children: [new Paragraph(String(r[k] == null ? '' : (Array.isArray(r[k]) ? r[k].join(', ') : r[k])))] }));
      tableRows.push(new TableRow({ children: cells }));
    });
    const table = new Table({ rows: tableRows });
    // append table as a separate section (docx supports multiple sections)
    doc.addSection({ children: [table] });
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function registerFirestoreListener() {
  if (firestoreListenerRegistered || !firestoreDb) return;

  try {
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
        if (currentUser && !appData.users.some(user => user.id === currentUser.id)) {
          alert('Your user account was deleted by an administrator. You will now be logged out.');
          logoutCurrentUser();
          return;
        }
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

      if (!snapshot.exists) {
        await withTimeout(docRef.set(JSON.parse(JSON.stringify(defaultAppData))));
        console.log('Created Firestore document attendance_master_data/appData with default app data');
        appData = JSON.parse(JSON.stringify(defaultAppData));
        firestoreSyncHealthy = true;
        lastFirestoreError = null;
        return;
      }

      firestoreSyncHealthy = false;
      console.warn('Firestore document exists but has no expected app data structure.');
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

  const projectId = firebase?.app?.().options?.projectId || 'unknown';
  const remoteSyncEnabled = localStorage.getItem(OFFLINE_MODE_KEY) !== 'true' && (typeof navigator === 'undefined' || navigator.onLine !== false);

  console.log('===== FIRESTORE SAVE START =====');
  console.log('Project:', projectId);
  console.log('Document: attendance_master_data/appData');

  if (!remoteSyncEnabled || !firestoreDb) {
    if (!remoteSyncEnabled) console.log('Remote sync disabled, skipping Firestore save.');
    return;
  }

  try {
    const docRef = getFirestoreDocRef();
    if (!docRef) {
      throw new Error('Firestore document reference is unavailable');
    }

    await withTimeout(docRef.set(JSON.parse(JSON.stringify(appData))));
    firestoreSyncHealthy = true;
    lastFirestoreError = null;
    console.log('===== FIRESTORE SAVE SUCCESS =====');
    console.log('Saved successfully to Firestore', { collection: 'attendance_master_data', document: 'appData' });
  } catch (error) {
    firestoreSyncHealthy = false;
    lastFirestoreError = error;
    console.error('===== FIRESTORE SAVE FAILED =====');
    console.error(error);
    throw error;
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

  const logoutBtnEl = document.getElementById('logoutBtn');
  if (logoutBtnEl) {
    logoutBtnEl.addEventListener('click', () => {
      logoutCurrentUser();
    });
  }
  // headerLogoutBtn removed from UI; no listener attached
}

function logoutCurrentUser() {
  currentUser = null;
  sessionStorage.removeItem('attendance_session_user');
  document.getElementById('appHeader')?.classList.add('hidden');
  document.getElementById('mainContainer')?.classList.add('hidden');
  document.getElementById('appSidebar')?.classList.add('hidden');
  document.getElementById('authWrapper')?.classList.remove('hidden');
  document.getElementById('loginForm')?.reset();
  document.querySelectorAll('.profile-menu.show').forEach(el => el.classList.remove('show'));
}

function logoutUserSessionIfActive(userId) {
  const storedUserRaw = sessionStorage.getItem('attendance_session_user');
  let storedUser = null;

  try {
    storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
  } catch (error) {
    sessionStorage.removeItem('attendance_session_user');
    storedUser = null;
  }

  if (storedUser && storedUser.id === userId) {
    sessionStorage.removeItem('attendance_session_user');
  }

  if (currentUser && currentUser.id === userId) {
    logoutCurrentUser();
    return true;
  }

  return Boolean(storedUser && storedUser.id === userId);
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
  document.getElementById('markDeptNameFilter').addEventListener('change', renderAttendanceMarkingForm);
  document.getElementById('applyMarkFiltersBtn').addEventListener('click', renderAttendanceMarkingForm);

  document.getElementById('markAllPresentBtn').addEventListener('click', () => setAll5Hours('P'));
  document.getElementById('markAllAbsentBtn').addEventListener('click', () => setAll5Hours('A'));

  document.getElementById('saveAttendanceBtn').addEventListener('click', handleSaveAttendance);
  const saveAttendanceFab = document.getElementById('saveAttendanceFab');
  if (saveAttendanceFab) {
    saveAttendanceFab.addEventListener('click', () => {
      handleSaveAttendance();
    });
  }
  document.getElementById('unlockBtn').addEventListener('click', handleUnlockAttendance);
  document.getElementById('inchargeUnlockBtn').addEventListener('click', handleInchargeUnlockAttendance);
  document.getElementById('notifBtn')?.addEventListener('click', handleNotificationsClick);
  document.getElementById('notifClearBtn')?.addEventListener('click', async () => {
    if (!currentUser) return;
    const notifications = getVisibleNotificationsForCurrentUser();
    if (notifications.length === 0) {
      alert('No notifications to clear.');
      return;
    }

    await clearNotificationsForCurrentUser();
  });

  // Calendar Date Filter and Category Filters in Viewing Area
  ['filterDate', 'filterTeam', 'filterDeptName', 'filterDept', 'filterYear'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderRecordsTable);
  });
  document.getElementById('applyHistoryFiltersBtn').addEventListener('click', renderRecordsTable);

  document.getElementById('clearDateFilterBtn').addEventListener('click', () => {
    document.getElementById('filterDate').value = '';
    renderRecordsTable();
  });

  document.getElementById('deleteDateBtn').addEventListener('click', deleteAttendanceDate);
  document.getElementById('deleteMonthBtn').addEventListener('click', deleteAttendanceMonth);
  document.getElementById('exportExcelBtn').addEventListener('click', openAttendanceExportModal);
  document.getElementById('cancelAttendanceExportBtn')?.addEventListener('click', () => closeModal('attendanceExportModal'));
  document.getElementById('closeAttendanceExportModal')?.addEventListener('click', () => closeModal('attendanceExportModal'));
  document.getElementById('startAttendanceExportBtn')?.addEventListener('click', exportToExcel);
  document.getElementById('studentSearchInput').addEventListener('input', renderStudentsTable);
  document.getElementById('clearStudentSearchBtn').addEventListener('click', () => {
    document.getElementById('studentSearchInput').value = '';
    renderStudentsTable();
  });
  document.getElementById('applyStudentFiltersBtn').addEventListener('click', renderStudentsTable);
  document.getElementById('clearStudentFiltersBtn').addEventListener('click', () => {
    const y = document.getElementById('studentFilterYear');
    const d = document.getElementById('studentFilterDept');
    if (y) y.value = 'ALL';
    if (d) d.value = 'ALL';
    renderStudentsTable();
  });
  

  document.getElementById('openAddStudentModalBtn').addEventListener('click', () => openStudentModal());
  const exportStudentsBtn = document.getElementById('exportStudentsBtn');
  if (exportStudentsBtn) exportStudentsBtn.addEventListener('click', openStudentExportModal);

  const exportExcelBtn = document.getElementById('exportExcelBtn');
  if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('attendance-export-requested'));
    }
  });
  const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
  if (sidebarSettingsBtn) sidebarSettingsBtn.addEventListener('click', () => {
    switchToTab('settingsTab');
    renderVisibleTab();
  });

  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
  if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', () => {
    logoutCurrentUser();
  });
  const profileSettingsBtn = document.getElementById('profileSettingsBtn');
  if (profileSettingsBtn) profileSettingsBtn.addEventListener('click', () => {
    switchToTab('settingsTab');
    renderVisibleTab();
    document.querySelectorAll('.profile-menu.show').forEach(el => el.classList.remove('show'));
  });

  const profileLogoutBtn = document.getElementById('profileLogoutBtn');
  if (profileLogoutBtn) profileLogoutBtn.addEventListener('click', () => {
    logoutCurrentUser();
  });
  // header Settings/Logout controls removed; actions remain available under the sidebar profile
  document.getElementById('closeStudentModal').addEventListener('click', () => closeModal('studentModal'));
  document.getElementById('cancelStudentBtn').addEventListener('click', () => closeModal('studentModal'));
  document.getElementById('studentForm').addEventListener('submit', handleSaveStudent);

  document.getElementById('addDeptForm').addEventListener('submit', handleAddDept);
  document.getElementById('addYearForm').addEventListener('submit', handleAddYear);
  document.getElementById('addSectionForm').addEventListener('submit', handleAddSection);
  document.getElementById('addTeamForm').addEventListener('submit', handleAddTeam);

  document.getElementById('openAddUserModalBtn').addEventListener('click', () => openUserModal());
  document.getElementById('closeUserModal').addEventListener('click', () => closeModal('userModal'));
  document.getElementById('cancelUserBtn').addEventListener('click', () => closeModal('userModal'));
  document.getElementById('userForm').addEventListener('submit', handleSaveUser);
  document.getElementById('newUserRole').addEventListener('change', updateUserTeamAssignmentVisibility);

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

  const signOutFromSettingsBtn = document.getElementById('signOutFromSettingsBtn');
  if (signOutFromSettingsBtn) {
    signOutFromSettingsBtn.addEventListener('click', () => {
      document.getElementById('logoutBtn').click();
    });
  }
}

function getStudentHourAttendanceSummary(studentId) {
  if (!Array.isArray(appData?.attendance)) return 'N/A';

  const matches = appData.attendance.filter(record => {
    const map = record?.studentAttendanceMap || {};
    return map[studentId];
  });

  if (!matches.length) return 'N/A';

  const last = matches[matches.length - 1];
  const map = last.studentAttendanceMap?.[studentId] || {};
  return ['h1', 'h2', 'h3', 'h4', 'h5'].map((hourKey, index) => `${index + 1}:${map[hourKey] || '-'}`).join(' | ');
}

function openStudentExportModal() {
  const modal = document.getElementById('studentExportModal');
  const colsContainer = document.getElementById('exportColumnsList');
  if (!modal || !colsContainer) return;

  const selectAll = document.getElementById('exportSelectAll');
  if (selectAll) {
    selectAll.checked = true;
    selectAll.onchange = () => {
      Array.from(colsContainer.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
        cb.checked = selectAll.checked;
      });
    };
  }

  Array.from(colsContainer.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
    cb.checked = true;
  });

  document.getElementById('cancelStudentExportBtn')?.addEventListener('click', () => closeModal('studentExportModal'));
  document.getElementById('closeStudentExportModal')?.addEventListener('click', () => closeModal('studentExportModal'));
  document.getElementById('startStudentExportBtn')?.addEventListener('click', () => startStudentExport());

  modal.classList.remove('hidden');
}

globalThis.startStudentExport = async function startStudentExport(columns = [], options = {}) {
  let selectedCols = [];
  const modal = document.getElementById('studentExportModal');

  if (Array.isArray(columns) && columns.length) {
    selectedCols = columns.map(col => col.key || col);
  } else if (modal) {
    const checked = Array.from(document.querySelectorAll('#exportColumnsList input[type="checkbox"]'));
    selectedCols = checked.filter(cb => cb.checked).map(cb => cb.dataset.key || cb.getAttribute('data-key'));
  } else {
    // default export order required by user
    selectedCols = ['name', 'rollNumber', 'registerNumber', 'mobile', 'deptName', 'year', 'department', 'section'];
  }

  if (!selectedCols.length) {
    alert('Please tick at least one field to export.');
    return { ok: false };
  }

  const rowIds = Array.from(globalThis.selectedExportStudents || []);
  let students = [...(appData?.students || [])].sort(sortStudents);

  const studentYearFilter = document.getElementById('studentFilterYear');
  const studentDeptFilter = document.getElementById('studentFilterDept');
  if (studentYearFilter && studentYearFilter.value && studentYearFilter.value !== 'ALL') {
    students = students.filter(student => (student.year || '') === studentYearFilter.value);
  }
  if (studentDeptFilter && studentDeptFilter.value && studentDeptFilter.value !== 'ALL') {
    students = students.filter(student => (student.deptName || '') === studentDeptFilter.value);
  }

  if (rowIds.length) {
    students = students.filter(student => rowIds.includes(student.id));
  }

  if (!students.length && typeof document !== 'undefined' && modal) {
    alert('No student records available for the current filter selection.');
    return { ok: false };
  }

  const exportRows = students.map(student => {
    const row = {};
    selectedCols.forEach(key => {
      if (key === 'name') row[key] = student.name || '';
      else if (key === 'year') row[key] = student.year || '';
      else if (key === 'section') row[key] = student.section || '';
      else if (key === 'deptName') row[key] = student.deptName || '';
      else if (key === 'department') row[key] = student.department || '';
      else if (key === 'team') row[key] = getStudentTeamIds(student).join(', ') || '';
      else if (key === 'mobile') row[key] = student.mobile || '';
      else if (key === 'rollNumber') row[key] = student.rollNumber || '';
      else if (key === 'registerNumber') row[key] = student.registerNumber || '';
    });
    return row;
  });

  const headerMap = {
    name: 'Student Name',
    deptName: 'Department Name',
    year: 'Year',
    department: 'Department Category',
    section: 'Section',
    rollNumber: 'Roll Number',
    registerNumber: 'Register Number',
    mobile: 'Mobile Number',
    team: 'Team',
  };

  // Build formatted rows with headers in the requested order
  const formattedRows = exportRows.map(studentRow => {
    const obj = {};
    selectedCols.forEach(key => {
      const label = headerMap[key] || key;
      obj[label] = studentRow[key] != null ? studentRow[key] : '';
    });
    return obj;
  });

  // Apply required sorting: Student Name A->Z, Roll Number numeric asc, Register Number numeric asc
  const sortedFormattedRows = sortExportRowsForExcel(formattedRows);

  // use sorted rows for export
  const rowsToWrite = sortedFormattedRows;

  const workbook = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rowsToWrite);

  if (formattedRows.length) {
    const columns = Object.keys(formattedRows[0]);
    ws['!cols'] = columns.map((header) => {
      const sample = formattedRows.reduce((max, row) => {
        const value = row[header];
        const text = value == null ? '' : String(value);
        return Math.max(max, text.length);
      }, String(header).length);
      return { wch: Math.max(sample + 3, 14) };
    });
    ws['!autofilter'] = { ref: `A1:${String.fromCharCode(64 + columns.length)}${formattedRows.length + 1}` };
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  }

  XLSX.utils.book_append_sheet(workbook, ws, 'Student Export');
  XLSX.writeFile(workbook, options.filename || 'STUDENT_EXPORT.xlsx');

  if (modal) closeModal('studentExportModal');
  return { ok: true, rows: exportRows.length };
};

// Keep the new premium shell and legacy sections in sync without changing app behavior.
// Simple tab history stack to support a Back button
globalThis._tabHistory = globalThis._tabHistory || [];

function switchToTab(tabId, recordHistory = true) {
  if (!tabId) return;
  if (recordHistory && currentTabId && currentTabId !== tabId) {
    globalThis._tabHistory.push(currentTabId);
    // limit history length
    if (globalThis._tabHistory.length > 50) globalThis._tabHistory.shift();
  }
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

function goBackTab() {
  const prev = (globalThis._tabHistory && globalThis._tabHistory.length) ? globalThis._tabHistory.pop() : null;
  if (prev) {
    switchToTab(prev, false);
  } else {
    switchToTab('dashboardTab', false);
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
  } else if (currentTabId === 'yearsTab') {
    renderYearsTags();
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
  renderNotifications();
  renderAttendanceMarkingForm();
  renderRecordsTable();
  renderStudentsTable();
  renderDeptsTags();
  renderYearsTags();
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
  const markableTeams = getMarkableTeamIds();
  markTeamSelect.innerHTML = markableTeams.map(t => `<option value="${t}">${t}</option>`).join('');

  const filterTeam = document.getElementById('filterTeam');
  filterTeam.innerHTML = `<option value="ALL">All Teams</option>` + appData.teams.map(t => `<option value="${t}">${t}</option>`).join('');

  const filterDeptName = document.getElementById('filterDeptName');
  filterDeptName.innerHTML = `<option value="ALL">All Department Names</option>` + appData.departments.map(d => `<option value="${d}">${d}</option>`).join('');

  const yearOptions = appData.years.map(year => `<option value="${year}">${year}</option>`).join('');
  const studentYear = document.getElementById('studentYear');
  if (studentYear) studentYear.innerHTML = yearOptions;
  // populate Student Master filter (multi-select)
  const studentFilterYear = document.getElementById('studentFilterYear');
  if (studentFilterYear) studentFilterYear.innerHTML = `<option value="ALL">All Years</option>` + yearOptions;
  const filterYear = document.getElementById('filterYear');
  if (filterYear) filterYear.innerHTML = `<option value="ALL">All Years</option>` + yearOptions;
  const markCategoryFilter = document.getElementById('markCategoryFilter');
  if (markCategoryFilter) markCategoryFilter.innerHTML = '<option value="ALL">All Categories</option><option value="Aided">Aided</option><option value="Self-Finance">Self-Finance</option>';
  const markDeptNameFilter = document.getElementById('markDeptNameFilter');
  if (markDeptNameFilter) markDeptNameFilter.innerHTML = '<option value="ALL">All Departments</option>' + appData.departments.map(d => `<option value="${d}">${d}</option>`).join('');
  const markYearFilter = document.getElementById('markYearFilter');
  if (markYearFilter) markYearFilter.innerHTML = `<option value="ALL">All Years</option>` + yearOptions;

  const studentDeptName = document.getElementById('studentDeptName');
  studentDeptName.innerHTML = appData.departments.map(d => `<option value="${d}">${d}</option>`).join('');
  const studentFilterDept = document.getElementById('studentFilterDept');
  if (studentFilterDept) studentFilterDept.innerHTML = `<option value="ALL">All Departments</option>` + appData.departments.map(d => `<option value="${d}">${d}</option>`).join('');

  const studentSection = document.getElementById('studentSection');
  studentSection.innerHTML = appData.sections.map(s => `<option value="${s}">${s}</option>`).join('');

  const studentTeam = document.getElementById('studentTeam');
  studentTeam.innerHTML = appData.teams.map(t => `<option value="${t}">${t}</option>`).join('');
}

function getStudentTeamIds(student) {
  const teamIds = Array.isArray(student.teamIds) ? [...student.teamIds] : [];
  if (student.teamId && !teamIds.includes(student.teamId)) teamIds.push(student.teamId);
  return teamIds;
}

function getUserTeamIds(user) {
  const teamIds = Array.isArray(user?.assignedTeamIds) ? [...user.assignedTeamIds] : [];
  if (user?.assignedTeamId && !teamIds.includes(user.assignedTeamId)) teamIds.push(user.assignedTeamId);
  return teamIds;
}

// Notification helpers: support per-user "readBy" without breaking existing boolean `read` flag.
function isNotificationReadByUser(notification, userId) {
  if (!notification) return false;
  if (notification.read === true) return true; // legacy global-read
  if (Array.isArray(notification.readBy)) return notification.readBy.includes(userId);
  return false;
}

function markNotificationReadByUser(notification, userId) {
  if (!notification) return;
  if (notification.read === true) return; // already globally read
  if (!Array.isArray(notification.readBy)) notification.readBy = [];
  if (!notification.readBy.includes(userId)) notification.readBy.push(userId);
}

function canUnlockAttendanceForUser(teamId, role = currentUser?.role, user = currentUser) {
  if (!teamId) return false;
  if (role === 'admin') return true;
  if (role !== 'incharge') return false;
  const allowedTeams = getUserTeamIds(user);
  return allowedTeams.includes(teamId);
}

function getMarkableTeamIds() {
  if (currentUser?.role === 'admin') return appData.teams;
  return appData.teams.filter(teamId => getUserTeamIds(currentUser).includes(teamId));
}

function canMarkTeam(teamId) {
  return currentUser?.role === 'admin' || (currentUser?.role === 'incharge' && getUserTeamIds(currentUser).includes(teamId));
}

function canEditAttendanceRecord(record, teamId) {
  if (!canMarkTeam(teamId)) return false;
  if (!record || !record.locked) return true;
  if (record.unlockMode === 'admin') return currentUser?.role === 'admin';
  if (record.unlockMode === 'admin-incharge') {
    return currentUser?.role === 'admin' || (currentUser?.role === 'incharge' && getUserTeamIds(currentUser).includes(teamId));
  }
  return false;
}

function isAttendanceRecordUnlocked(record) {
  if (!record || !record.locked) return true;
  if (record?.unlockMode === 'admin') return currentUser?.role === 'admin';
  if (record?.unlockMode === 'admin-incharge') return currentUser?.role === 'admin' || (currentUser?.role === 'incharge' && getUserTeamIds(currentUser).includes(record.teamId));
  return false;
}

function getStudentAttendanceRecord(studentId, teamId, date) {
  return appData.attendance.find(record =>
    record.teamId === teamId && record.date === date && record.studentAttendanceMap?.[studentId]
  );
}

function isStudentMarkedInAnotherTeam(studentId, date, teamId) {
  return appData.attendance.some(record =>
    record.date === date && record.teamId !== teamId &&
    record.studentAttendanceMap?.[studentId]
  );
}

function isStudentLockedInTeam(studentId, record) {
  return Boolean(record?.studentAttendanceMap?.[studentId]) && !isAttendanceRecordUnlocked(record);
}

function isTeamAttendanceComplete(teamId, record) {
  const teamStudentIds = appData.students
    .filter(student => getStudentTeamIds(student).includes(teamId))
    .map(student => student.id);
  return teamStudentIds.length > 0 && teamStudentIds.every(studentId => record?.studentAttendanceMap?.[studentId]);
}

// 5-Hour Attendance Marking Form
function getYearSortValue(yearValue) {
  const value = String(yearValue ?? '').trim().toUpperCase();
  if (!value) return Number.MAX_SAFE_INTEGER;

  const normalized = value.replace(/\s+YEAR$/, '').replace(/\s+/g, ' ');
  const map = {
    '1ST': 1, 'FIRST': 1, 'I': 1,
    '2ND': 2, 'SECOND': 2, 'II': 2,
    '3RD': 3, 'THIRD': 3, 'III': 3,
    '4TH': 4, 'FOURTH': 4, 'IV': 4,
  };

  if (map[normalized] !== undefined) return map[normalized];
  const asNumber = Number.parseInt(normalized.replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(asNumber) ? Number.MAX_SAFE_INTEGER : asNumber;
}

function compareStudentOrder(left, right, options = {}) {
  const directionFor = (fieldName, defaultDirection = 'asc') => {
    const chosen = options[`${fieldName}Direction`] ?? defaultDirection;
    return chosen === 'desc' ? -1 : 1;
  };

  const normalizeDepartment = (value) => {
    const department = String(value || '').trim();
    if (/^\s*AID/i.test(department)) return 0;
    if (/SELF[- ]?FINANCE/i.test(department)) return 1;
    return 2;
  };

  // Finance category rank: ensure Aided students appear before Self-Finance, then others
  const leftCategoryRank = normalizeDepartment(left.department || left['Department Category'] || left.departmentCategory);
  const rightCategoryRank = normalizeDepartment(right.department || right['Department Category'] || right.departmentCategory);
  if (leftCategoryRank !== rightCategoryRank) return (leftCategoryRank - rightCategoryRank) * directionFor('department', 'asc');

  // Secondary: Year order (First -> Second -> Third -> Fourth). Use existing helper.
  const leftYearRank = getYearSortValue(left.year || left['Year']);
  const rightYearRank = getYearSortValue(right.year || right['Year']);
  if (leftYearRank !== rightYearRank) return (leftYearRank - rightYearRank) * directionFor('year', 'asc');

  // Next: Department name A -> Z
  const leftDeptName = String(left.deptName || left['Department Name'] || '').trim().toUpperCase();
  const rightDeptName = String(right.deptName || right['Department Name'] || '').trim().toUpperCase();
  if (leftDeptName !== rightDeptName) return leftDeptName.localeCompare(rightDeptName) * directionFor('deptName', 'asc');

  // Next: Student name A -> Z
  const leftName = String(left.name || left.studentName || left['Student Name'] || '').trim().toUpperCase();
  const rightName = String(right.name || right.studentName || right['Student Name'] || '').trim().toUpperCase();
  if (leftName !== rightName) return leftName.localeCompare(rightName) * directionFor('name', 'asc');

  // Finally: Roll number numeric ascending, then register number numeric ascending
  const numericValueFromString = (value) => {
    if (value == null) return Number.NaN;
    const digits = String(value).match(/\d+/g);
    if (!digits || !digits.length) return Number.NaN;
    return Number.parseInt(digits.join(''), 10);
  };

  const leftRollNum = numericValueFromString(left.rollNumber || left['Roll Number'] || left.roll);
  const rightRollNum = numericValueFromString(right.rollNumber || right['Roll Number'] || right.roll);
  if (!Number.isNaN(leftRollNum) || !Number.isNaN(rightRollNum)) {
    if (Number.isNaN(leftRollNum)) return -1 * directionFor('rollNumber', 'asc');
    if (Number.isNaN(rightRollNum)) return 1 * directionFor('rollNumber', 'asc');
    if (leftRollNum !== rightRollNum) return (leftRollNum - rightRollNum) * directionFor('rollNumber', 'asc');
  } else {
    const lRoll = String(left.rollNumber || left['Roll Number'] || '').trim();
    const rRoll = String(right.rollNumber || right['Roll Number'] || '').trim();
    if (lRoll !== rRoll) return lRoll.localeCompare(rRoll, undefined, { numeric: true, sensitivity: 'base' }) * directionFor('rollNumber', 'asc');
  }

  const leftRegNum = numericValueFromString(left.registerNumber || left['Register Number'] || left.registerNumber);
  const rightRegNum = numericValueFromString(right.registerNumber || right['Register Number'] || right.registerNumber);
  if (!Number.isNaN(leftRegNum) || !Number.isNaN(rightRegNum)) {
    if (Number.isNaN(leftRegNum)) return -1 * directionFor('registerNumber', 'asc');
    if (Number.isNaN(rightRegNum)) return 1 * directionFor('registerNumber', 'asc');
    if (leftRegNum !== rightRegNum) return (leftRegNum - rightRegNum) * directionFor('registerNumber', 'asc');
  }

  const lReg = String(left.registerNumber || left['Register Number'] || '').trim();
  const rReg = String(right.registerNumber || right['Register Number'] || '').trim();
  return lReg.localeCompare(rReg, undefined, { numeric: true, sensitivity: 'base' }) * directionFor('registerNumber', 'asc');
}

function sortStudents(left, right) {
  return compareStudentOrder(left, right);
}

function sortStudentsWithDirection(left, right, options = {}) {
  return compareStudentOrder(left, right, options);
}

function sortExportRowsForExcel(rows) {
  // Use central compareStudentOrder to ensure consistent ordering across exports
  return [...rows].sort((left, right) => {
    const a = {
      department: left['Department Category'] || left.department || left['Aided / Self Finance'] || left.departmentCategory,
      deptName: left['Department Name'] || left.deptName || left['Department'] || left.dept,
      year: left['Year'] || left.year,
      name: left['Student Name'] || left.studentName || left.name,
      rollNumber: left['ROLL NUMBER'] || left['Roll Number'] || left.rollNumber || left.roll,
      registerNumber: left['REGISTER NUMBER'] || left['Register Number'] || left.registerNumber || left.register
    };
    const b = {
      department: right['Department Category'] || right.department || right['Aided / Self Finance'] || right.departmentCategory,
      deptName: right['Department Name'] || right.deptName || right['Department'] || right.dept,
      year: right['Year'] || right.year,
      name: right['Student Name'] || right.studentName || right.name,
      rollNumber: right['ROLL NUMBER'] || right['Roll Number'] || right.rollNumber || right.roll,
      registerNumber: right['REGISTER NUMBER'] || right['Register Number'] || right.registerNumber || right.register
    };
    return compareStudentOrder(a, b);
  });
}

globalThis.sortStudentsWithDirection = sortStudentsWithDirection;

function renderAttendanceMarkingForm() {
  const teamId = document.getElementById('markTeamSelect').value;
  const date = document.getElementById('markDate').value;
  const categoryFilter = document.getElementById('markCategoryFilter')?.value || 'ALL';
  const deptNameFilter = document.getElementById('markDeptNameFilter')?.value || 'ALL';
  const yearFilter = document.getElementById('markYearFilter')?.value || 'ALL';

  const tbody = document.getElementById('attendanceMarkTbody');
  tbody.innerHTML = '';

  if (!teamId || !date) return;

  const teamStudents = [...appData.students.filter(s => getStudentTeamIds(s).includes(teamId)
    && (categoryFilter === 'ALL' || s.department === categoryFilter)
    && (deptNameFilter === 'ALL' || s.deptName === deptNameFilter)
    && (yearFilter === 'ALL' || s.year === yearFilter))].sort(sortStudents);
  document.getElementById('teamStudentCountTitle').textContent = `Team Students (${teamStudents.length})`;

  const existingRecord = appData.attendance.find(a => a.teamId === teamId && a.date === date);
  const canEdit = canEditAttendanceRecord(existingRecord, teamId);
  const canUnlockByIncharge = currentUser?.role === 'admin' || (currentUser?.role === 'incharge' && getUserTeamIds(currentUser).includes(teamId));
  const isLocked = existingRecord?.locked && !canEdit;

  const markLockBanner = document.getElementById('markLockBanner');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const batchActionBtns = document.getElementById('batchActionBtns');

  if (isLocked) {
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

  const unlockBtn = document.getElementById('unlockBtn');
  const inchargeUnlockBtn = document.getElementById('inchargeUnlockBtn');
  const isAdminUnlockVisible = Boolean(existingRecord?.locked && currentUser?.role === 'admin');
  if (unlockBtn) unlockBtn.classList.toggle('hidden', !isAdminUnlockVisible);
  if (inchargeUnlockBtn) inchargeUnlockBtn.classList.toggle('hidden', !isAdminUnlockVisible);

  if (teamStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">No students assigned to this Team.</td></tr>`;
    return;
  }

  teamStudents.forEach(s => {
    let h1 = 'P', h2 = 'P', h3 = 'P', h4 = 'P', h5 = 'P';
    const studentRecord = getStudentAttendanceRecord(s.id, teamId, date);
    // find if this student was marked in another team for the same date
    const otherRecord = appData.attendance.find(a => a.date === date && a.teamId !== teamId && a.studentAttendanceMap?.[s.id]);
    const isStudentLocked = isStudentLockedInTeam(s.id, existingRecord) || Boolean(otherRecord);

    if (studentRecord) {
      const rec = studentRecord.studentAttendanceMap[s.id];
      h1 = rec.h1 || 'P'; h2 = rec.h2 || 'P'; h3 = rec.h3 || 'P'; h4 = rec.h4 || 'P'; h5 = rec.h5 || 'P';
    } else if (otherRecord) {
      // show values from the other team and mark as locked
      const rec = otherRecord.studentAttendanceMap[s.id];
      h1 = rec.h1 || 'P'; h2 = rec.h2 || 'P'; h3 = rec.h3 || 'P'; h4 = rec.h4 || 'P'; h5 = rec.h5 || 'P';
    }

    const markedFrom = otherRecord ? ` <small style="color:var(--text-muted)">(Marked in ${otherRecord.teamId})</small>` : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Roll No"><strong>${s.rollNumber}</strong></td>
      <td data-label="Register No">${s.registerNumber}</td>
      <td data-label="Student Name">${s.name}${markedFrom}</td>
      <td data-label="Department">${s.deptName || 'Computer Science'}</td>
      <td data-label="Category"><span class="badge ${s.department === 'Aided' ? 'badge-aided' : 'badge-self'}">${s.department}</span></td>
      
      <td data-label="H1" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h1 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="1" aria-label="${h1 === 'P' ? 'Present' : 'Absent'} for hour 1" aria-pressed="${h1 === 'P'}" title="${h1 === 'P' ? 'Present' : 'Absent'}" ${(isLocked || isStudentLocked) ? 'disabled' : ''}>${h1}</button></td>
      <td data-label="H2" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h2 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="2" aria-label="${h2 === 'P' ? 'Present' : 'Absent'} for hour 2" aria-pressed="${h2 === 'P'}" title="${h2 === 'P' ? 'Present' : 'Absent'}" ${(isLocked || isStudentLocked) ? 'disabled' : ''}>${h2}</button></td>
      <td data-label="H3" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h3 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="3" aria-label="${h3 === 'P' ? 'Present' : 'Absent'} for hour 3" aria-pressed="${h3 === 'P'}" title="${h3 === 'P' ? 'Present' : 'Absent'}" ${(isLocked || isStudentLocked) ? 'disabled' : ''}>${h3}</button></td>
      <td data-label="H4" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h4 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="4" aria-label="${h4 === 'P' ? 'Present' : 'Absent'} for hour 4" aria-pressed="${h4 === 'P'}" title="${h4 === 'P' ? 'Present' : 'Absent'}" ${(isLocked || isStudentLocked) ? 'disabled' : ''}>${h4}</button></td>
      <td data-label="H5" style="text-align: center;"><button type="button" class="pa-toggle-btn ${h5 === 'P' ? 'present' : 'absent'}" onclick="togglePABtn(this)" data-student="${s.id}" data-hour="5" aria-label="${h5 === 'P' ? 'Present' : 'Absent'} for hour 5" aria-pressed="${h5 === 'P'}" title="${h5 === 'P' ? 'Present' : 'Absent'}" ${(isLocked || isStudentLocked) ? 'disabled' : ''}>${h5}</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function togglePABtn(btn) {
  if (!canMarkTeam(document.getElementById('markTeamSelect')?.value) || btn.disabled) return;
  if (btn.textContent === 'P') {
    btn.textContent = 'A';
    btn.classList.remove('present');
    btn.classList.add('absent');
    btn.setAttribute('aria-label', `Absent for hour ${btn.dataset.hour}`);
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'Absent';
  } else {
    btn.textContent = 'P';
    btn.classList.remove('absent');
    btn.classList.add('present');
    btn.setAttribute('aria-label', `Present for hour ${btn.dataset.hour}`);
    btn.setAttribute('aria-pressed', 'true');
    btn.title = 'Present';
  }
}

function setAll5Hours(val) {
  if (!canMarkTeam(document.getElementById('markTeamSelect')?.value)) return;

  document.querySelectorAll('#attendanceMarkTbody .pa-toggle-btn').forEach(btn => {
    if (!btn.disabled) {
      btn.textContent = val;
      if (val === 'P') {
        btn.classList.remove('absent'); btn.classList.add('present');
        btn.setAttribute('aria-label', `Present for hour ${btn.dataset.hour}`);
        btn.setAttribute('aria-pressed', 'true');
        btn.title = 'Present';
      } else {
        btn.classList.remove('present'); btn.classList.add('absent');
        btn.setAttribute('aria-label', `Absent for hour ${btn.dataset.hour}`);
        btn.setAttribute('aria-pressed', 'false');
        btn.title = 'Absent';
      }
    }
  });
}

async function handleSaveAttendance() {
  const teamId = document.getElementById('markTeamSelect').value;
  if (!canMarkTeam(teamId)) {
    alert('You can only mark attendance for teams allotted to you by an administrator.');
    return;
  }

  const date = document.getElementById('markDate').value;
  const categoryFilter = document.getElementById('markCategoryFilter')?.value || 'ALL';
  const deptNameFilter = document.getElementById('markDeptNameFilter')?.value || 'ALL';
  const yearFilter = document.getElementById('markYearFilter')?.value || 'ALL';
  const teamStudents = appData.students.filter(s => getStudentTeamIds(s).includes(teamId)
    && (categoryFilter === 'ALL' || s.department === categoryFilter)
    && (deptNameFilter === 'ALL' || s.deptName === deptNameFilter)
    && (yearFilter === 'ALL' || s.year === yearFilter));

  if (teamStudents.length === 0) {
    alert('No students to mark attendance for!');
    return;
  }

  const studentAttendanceMap = {};
  const index = appData.attendance.findIndex(a => a.teamId === teamId && a.date === date);
  const existingTeamRecord = index >= 0 ? appData.attendance[index] : null;
  const wasTeamComplete = isTeamAttendanceComplete(teamId, existingTeamRecord);
  if (existingTeamRecord?.studentAttendanceMap) {
    Object.assign(studentAttendanceMap, existingTeamRecord.studentAttendanceMap);
  }

  teamStudents.forEach(s => {
    if (isStudentMarkedInAnotherTeam(s.id, date, teamId)) return;

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

  if (Object.keys(studentAttendanceMap).length === 0) {
    alert(`Attendance for these students has already been marked for ${date}.`);
    return;
  }

  // When saved by an incharge or admin, lock the team's entered attendance immediately
  const teamIsComplete = isTeamAttendanceComplete(teamId, { studentAttendanceMap });
  const markingInchargeName = currentUser?.name || currentUser?.username || 'System';
  const newRecord = {
    id: index >= 0 ? appData.attendance[index].id : 'att_' + Date.now(),
    teamId, date, studentAttendanceMap,
    markedBy: markingInchargeName,
    // lock the record on save to prevent further changes unless unlocked by Admin
    locked: true,
    teamLocked: true,
    // default unlock mode requires Admin to unlock; Admin can later set 'admin-incharge' via button
    unlockMode: 'admin',
    timestamp: new Date().toISOString()
  };

  if (teamIsComplete && !wasTeamComplete) {
    appData.notifications = Array.isArray(appData.notifications) ? appData.notifications : [];
    appData.notifications.unshift({
      id: 'notification_' + Date.now(),
      type: 'team-attendance-complete',
      teamId,
      date,
      message: `Attendance entered for ${teamId} by ${markingInchargeName} on ${date}. Team attendance is now complete.`,
      read: false,
      timestamp: new Date().toISOString()
    });
  }

  // If a student-incharge performed the marking, add notifications for admin and for the incharge
  if (currentUser?.role === 'incharge') {
    appData.notifications = Array.isArray(appData.notifications) ? appData.notifications : [];
    // Notify admin(s)
    appData.notifications.unshift({
      id: 'notification_' + Date.now() + '_admin',
      type: 'incharge-marked-attendance',
      teamId,
      date,
      senderId: currentUser.id,
      message: `Student Incharge ${markingInchargeName} entered attendance for team ${teamId} on ${date}.`,
      read: false,
      timestamp: new Date().toISOString()
    });
    // Notify the incharge (self) about locks/summary
    appData.notifications.unshift({
      id: 'notification_' + Date.now() + '_incharge',
      type: 'incharge-attendance-saved',
      teamId,
      date,
      senderId: currentUser.id,
      message: `${markingInchargeName} saved attendance for team ${teamId} on ${date}.`,
      read: false,
      timestamp: new Date().toISOString()
    });
  }

  if (index >= 0) appData.attendance[index] = newRecord;
  else appData.attendance.push(newRecord);

  await saveAppData();
  const toastMessage = `${teamId} attendance entered by ${markingInchargeName}.`;
  showPushNotification(toastMessage, 'success', 4200);
  alert(teamIsComplete
    ? `5-Hour attendance saved and the entire team is locked for ${teamId} (${date})!`
    : `5-Hour attendance saved. Marked students are locked; the team remains open for the remaining students.`);
  renderAttendanceMarkingForm();
  renderRecordsTable();
}

async function handleUnlockAttendance() {
  if (currentUser?.role !== 'admin') return;
  const teamId = document.getElementById('markTeamSelect').value;
  const date = document.getElementById('markDate').value;

  const record = appData.attendance.find(a => a.teamId === teamId && a.date === date);
  if (!record) {
    alert('No attendance record found for the selected team and date.');
    return;
  }

  record.locked = false;
  record.unlockMode = 'admin';
  await saveAppData();
  alert('Attendance record unlocked for Admin editing only!');
  renderAttendanceMarkingForm();
  renderRecordsTable();
}

async function handleInchargeUnlockAttendance() {
  if (currentUser?.role !== 'admin') {
    alert('Only admin users can control the unlock buttons.');
    return;
  }

  const teamId = document.getElementById('markTeamSelect').value;
  const date = document.getElementById('markDate').value;
  const record = appData.attendance.find(a => a.teamId === teamId && a.date === date);

  if (!record) {
    alert('No attendance record found for the selected team and date.');
    return;
  }

  record.locked = false;
  // set to allow admin and assigned incharge to edit
  record.unlockMode = 'admin-incharge';
  await saveAppData();
  alert('Attendance record unlocked for Admin and assigned Student Incharge editing.');
  renderAttendanceMarkingForm();
  renderRecordsTable();
}

function getVisibleNotificationsForCurrentUser() {
  if (!currentUser) return [];

  const allNotifications = Array.isArray(appData.notifications) ? appData.notifications : [];
  if (currentUser.role === 'admin') {
    return allNotifications.filter(n => n.type === 'team-attendance-complete' || n.type === 'incharge-marked-attendance');
  }

  if (currentUser.role === 'incharge') {
    return allNotifications.filter(n => (n.type && n.type.startsWith('incharge')) && (n.senderId === currentUser.id || n.type === 'incharge-attendance-saved'));
  }

  return [];
}

async function clearNotificationsForCurrentUser() {
  if (!currentUser) return;

  const notifications = getVisibleNotificationsForCurrentUser();
  if (notifications.length === 0) return;

  appData.notifications = (Array.isArray(appData.notifications) ? appData.notifications : []).filter(notification =>
    !notifications.some(item => item.id === notification.id)
  );

  await saveAppData();
  renderNotifications();
}
globalThis.clearNotificationsForCurrentUser = clearNotificationsForCurrentUser;

function showPushNotification(message, type = 'info', durationMs = 4200) {
  const notification = document.getElementById('pushDownNotification');
  if (!notification) return;

  notification.textContent = message;
  notification.classList.remove('show', 'success', 'info');
  notification.classList.add(type, 'show');
  notification.classList.remove('hidden');

  clearTimeout(showPushNotification._timerId);
  showPushNotification._timerId = setTimeout(() => {
    notification.classList.remove('show');
    notification.classList.add('hidden');
  }, durationMs);
}

function renderNotifications() {
  const notificationDot = document.querySelector('#notifBtn .notif-dot');
  const clearBtn = document.getElementById('notifClearBtn');
  if (!notificationDot) return;

  let unreadCount = 0;
  if (currentUser?.role === 'admin') {
    unreadCount = (appData.notifications || []).filter(notification => !isNotificationReadByUser(notification, currentUser.id)).length;
  } else if (currentUser?.role === 'incharge') {
    unreadCount = (appData.notifications || []).filter(notification => !isNotificationReadByUser(notification, currentUser.id) && (
      (notification.type && notification.type.startsWith('incharge')) || notification.senderId === currentUser.id
    )).length;
  }

  notificationDot.classList.toggle('hidden', unreadCount === 0);
  notificationDot.setAttribute('aria-label', unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'No unread notifications');

  if (clearBtn) {
    const visibleNotifications = getVisibleNotificationsForCurrentUser();
    clearBtn.classList.toggle('hidden', visibleNotifications.length === 0);
  }
}

async function handleNotificationsClick() {
  const notifications = getVisibleNotificationsForCurrentUser();

  if (notifications.length === 0) {
    alert('No notifications.');
    return;
  }

  alert(notifications.slice(0, 10).map(notification => notification.message).join('\n'));
  const unreadNotifications = notifications.filter(notification => !isNotificationReadByUser(notification, currentUser.id));
  unreadNotifications.forEach(notification => { markNotificationReadByUser(notification, currentUser.id); });
  if (unreadNotifications.length > 0) {
    await saveAppData();
    renderNotifications();
  }
}

async function deleteAttendanceRecords(periodLabel, matchesPeriod) {
  if (currentUser?.role !== 'admin') return;

  const matchingRecords = appData.attendance.filter(matchesPeriod);
  if (matchingRecords.length === 0) {
    alert(`No attendance records found for ${periodLabel}.`);
    return;
  }

  if (!confirm(`Delete all attendance data for ${periodLabel}? This cannot be undone.`)) return;

  appData.attendance = appData.attendance.filter(record => !matchesPeriod(record));
  await saveAppData();
  renderAllViews();
  alert(`Attendance data for ${periodLabel} was deleted.`);
}

async function deleteAttendanceDate() {
  const date = document.getElementById('filterDate').value;
  if (!date) {
    alert('Select a date before deleting attendance.');
    return;
  }

  await deleteAttendanceRecords(date, record => record.date === date);
}

async function deleteAttendanceMonth() {
  const date = document.getElementById('filterDate').value;
  if (!date) {
    alert('Select a date in the month before deleting attendance.');
    return;
  }

  const month = date.slice(0, 7);
  await deleteAttendanceRecords(month, record => record.date?.slice(0, 7) === month);
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
  const filterYearVal = document.getElementById('filterYear')?.value || 'ALL';

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
      if (filterYearVal !== 'ALL' && student.year !== filterYearVal) return;

      [hours.h1, hours.h2, hours.h3, hours.h4, hours.h5].forEach(st => {
        totalHoursCount++;
        if (st === 'P') presentHoursCount++; else absentHoursCount++;
      });

      rowList.push({
        studentId: student.id,
        date: att.date,
        teamName: att.teamId,
        studentName: student.name,
        rollNumber: student.rollNumber,
        registerNumber: student.registerNumber,
        mobile: student.mobile,
        deptName: student.deptName || 'N/A',
        department: student.department,
        year: student.year || 'N/A',
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
globalThis.isStudentMarkedInAnotherTeam = isStudentMarkedInAnotherTeam;
globalThis.renderAttendanceMarkingForm = renderAttendanceMarkingForm;
globalThis.sortStudents = sortStudents;
globalThis.exportToExcel = exportToExcel;
// Compute per-student attendance metrics respecting filters and overrides
function computeStudentAttendanceMetrics(studentId, dateFilter = '', teamFilter = '') {
  let present = 0, absent = 0, totalScheduled = 0;
  if (!Array.isArray(appData.attendance)) return { hoursPresent: 0, hoursAbsent: 0, totalScheduled: 0 };
  appData.attendance.forEach(record => {
    if (teamFilter && teamFilter !== 'ALL' && record.teamId !== teamFilter) return;
    if (dateFilter && record.date !== dateFilter) return;
    const entry = record.studentAttendanceMap && record.studentAttendanceMap[studentId];
    if (!entry) return;
    ['h1','h2','h3','h4','h5'].forEach(k => {
      const v = entry[k];
      if (v != null && v !== '') {
        totalScheduled += 1;
        if (v === 'P') present += 1; else absent += 1;
      }
    });
  });

  // apply overrides if present
  if (Array.isArray(appData.attendanceOverrides)) {
    appData.attendanceOverrides.forEach(ov => {
      if (ov.studentId !== studentId) return;
      if (teamFilter && teamFilter !== 'ALL' && ov.teamId && ov.teamId !== teamFilter) return;
      if (dateFilter && ov.date && ov.date !== dateFilter) return;
      if (ov.field === 'hoursPresent') present = Number(ov.newValue) || present;
      if (ov.field === 'hoursAbsent') absent = Number(ov.newValue) || absent;
    });
  }

  return { hoursPresent: present, hoursAbsent: absent, totalScheduled };
}
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
    tbody.innerHTML = `<tr><td colspan="15" style="text-align: center; color: var(--text-muted); padding: 2rem;">No attendance records found matching selected date & filters.</td></tr>`;
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
      <td data-label="Year">${r.year}</td>
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

function openAttendanceExportModal() {
  const modal = document.getElementById('attendanceExportModal');
  const colsContainer = document.getElementById('attendanceExportColumnsList');
  const selectAll = document.getElementById('attendanceExportSelectAll');
  if (!modal || !colsContainer) return;

  if (selectAll) {
    selectAll.checked = true;
    selectAll.onchange = () => {
      Array.from(colsContainer.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
        cb.checked = selectAll.checked;
      });
    };
  }

  modal.classList.remove('hidden');
}

function exportToExcel() {
  const modal = document.getElementById('attendanceExportModal');
  const checkedFields = modal
    ? Array.from(document.querySelectorAll('#attendanceExportColumnsList input[type="checkbox"]'))
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.key || cb.getAttribute('data-key'))
    : ['studentName', 'section', 'deptName', 'year', 'department', 'teamName', 'hourWiseAttendance', 'rollNumber', 'registerNumber'];

  if (!checkedFields.length) {
    alert('Please select at least one field to export.');
    return;
  }

  const filterDateVal = document.getElementById('filterDate').value;
  const { rowList } = getSortedFilteredAttendanceRows();

  let exportRows = [...rowList];

  if (globalThis.selectedExportRecords && globalThis.selectedExportRecords.size > 0) {
    const sel = new Set(globalThis.selectedExportRecords);
    exportRows = exportRows.filter(r => sel.has(`${r.studentId}__${r.date}__${r.teamName}`));
    if (exportRows.length === 0) {
      alert('No selected attendance records to export.');
      return;
    }
  }

  const uniqueStudentRows = new Map();
  exportRows.forEach(row => {
    if (!row?.studentId || uniqueStudentRows.has(row.studentId)) return;
    uniqueStudentRows.set(row.studentId, row);
  });
  exportRows = sortExportRowsForExcel(Array.from(uniqueStudentRows.values()));

  const fieldMap = {
    studentName: 'STUDENT NAME',
    section: 'SECTION',
    deptName: 'DEPARTMENT NAME',
    year: 'YEAR',
    department: 'AIDED / SELF FINANCE',
    teamName: 'TEAM',
    hourWiseAttendance: 'HOUR WISE ATTENDANCE',
    rollNumber: 'ROLL NUMBER',
    registerNumber: 'REGISTER NUMBER',
    h1: 'H1',
    h2: 'H2',
    h3: 'H3',
    h4: 'H4',
    h5: 'H5'
  };

  const exportData = exportRows.map(row => {
    const entry = {};
    if (checkedFields.includes('studentName')) entry[fieldMap.studentName] = row.studentName || '';
    if (checkedFields.includes('section')) entry[fieldMap.section] = row.section || '';
    if (checkedFields.includes('deptName')) entry[fieldMap.deptName] = row.deptName || '';
    if (checkedFields.includes('year')) entry[fieldMap.year] = row.year || '';
    if (checkedFields.includes('department')) entry[fieldMap.department] = row.department || '';
    if (checkedFields.includes('teamName')) entry[fieldMap.teamName] = row.teamName || '';
    if (checkedFields.includes('hourWiseAttendance')) {
      entry[fieldMap.h1] = row.h1 || 'A';
      entry[fieldMap.h2] = row.h2 || 'A';
      entry[fieldMap.h3] = row.h3 || 'A';
      entry[fieldMap.h4] = row.h4 || 'A';
      entry[fieldMap.h5] = row.h5 || 'A';
    }
    if (checkedFields.includes('rollNumber')) entry[fieldMap.rollNumber] = row.rollNumber || '';
    if (checkedFields.includes('registerNumber')) entry[fieldMap.registerNumber] = row.registerNumber || '';

    Object.keys(entry).forEach(key => {
      const value = entry[key];
      if (typeof value === 'string') entry[key] = value.toUpperCase();
    });

    return entry;
  });

  if (!exportData.length) {
    alert('No data available to export with current filters.');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const maxColWidth = Object.keys(exportData[0] || {}).map((key, index) => {
    const sample = exportData.reduce((max, row) => {
      const val = row[key];
      const text = val == null ? '' : String(val);
      return Math.max(max, text.length);
    }, String(key).length);
    return { wch: Math.max(sample + 3, 16) };
  });
  worksheet['!cols'] = maxColWidth;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance_History');

  const fileName = `Attendance_History_${filterDateVal || new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  if (modal) closeModal('attendanceExportModal');
}

// Student Directory
function renderStudentsTable() {
  const searchInput = document.getElementById('studentSearchInput');
  const searchQuery = (searchInput?.value || '').toLowerCase();
  const tbody = document.getElementById('studentsTbody');
  const clearSearchBtn = document.getElementById('clearStudentSearchBtn');
  if (clearSearchBtn) {
    clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
  }
  tbody.innerHTML = '';

  const yearFilter = document.getElementById('studentFilterYear');
  const deptFilter = document.getElementById('studentFilterDept');
  const selectedYear = yearFilter?.value || 'ALL';
  const selectedDept = deptFilter?.value || 'ALL';

  const filtered = [...appData.students.filter(s => {
    const matchesYear = selectedYear === 'ALL' || (s.year || '') === selectedYear;
    const matchesDept = selectedDept === 'ALL' || (s.deptName || '') === selectedDept;
    const matchesSearch = s.name.toLowerCase().includes(searchQuery) ||
      (s.rollNumber || '').toLowerCase().includes(searchQuery) ||
      (s.registerNumber || '').toLowerCase().includes(searchQuery) ||
      ((s.deptName || '').toLowerCase().includes(searchQuery));

    return matchesYear && matchesDept && matchesSearch;
  })].sort(sortStudents);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 2rem;">No student records found.</td></tr>`;
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
      <td data-label="Year">${s.year || 'N/A'}</td>
      <td data-label="Section">${s.section}</td>
      <td data-label="Team"><span style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">${getStudentTeamIds(s).join(', ') || 'Team Alpha'}</span></td>
      <td data-label="Actions" class="admin-only">
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="openStudentModal('${s.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s.id}')">🗑️ Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (currentUser?.role !== 'admin') {
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
      document.getElementById('studentYear').value = s.year || appData.years[0];
      document.getElementById('studentSection').value = s.section;
      const assignedTeamIds = getStudentTeamIds(s);
      Array.from(document.getElementById('studentTeam').options).forEach(option => {
        option.selected = assignedTeamIds.includes(option.value);
      });
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
  const year = document.getElementById('studentYear').value;
  const section = document.getElementById('studentSection').value;
  const studentTeam = document.getElementById('studentTeam');
  const teamIds = Array.from(studentTeam.selectedOptions || [])
    .map(option => option.value)
    .filter(Boolean);
  const teamId = teamIds[0] || '';

  const studentData = { id: id || 's_' + Date.now(), name, rollNumber, registerNumber, mobile, deptName, department, year, section, teamId, teamIds };

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

function renderYearsTags() {
  const container = document.getElementById('yearsTagList');
  if (!container) return;
  container.innerHTML = appData.years.map(year => `
    <div class="tag-item">
      <span>📚 ${year}</span>
      <button class="tag-remove" onclick="removeYear('${year}')">&times;</button>
    </div>
  `).join('');
}

async function handleAddYear(e) {
  e.preventDefault();
  if (currentUser?.role !== 'admin') return;
  const input = document.getElementById('newYearInput');
  const name = input.value.trim();
  if (name && !appData.years.includes(name)) {
    appData.years.push(name);
    await saveAppData();
    input.value = '';
    populateDropdowns();
    renderYearsTags();
  }
}

async function removeYear(yearName) {
  if (currentUser?.role !== 'admin') return;
  if (confirm(`Remove Year "${yearName}"?`)) {
    appData.years = appData.years.filter(year => year !== yearName);
    await saveAppData();
    populateDropdowns();
    renderYearsTags();
    renderStudentsTable();
  }
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
  // Add a short rules note for teams: notifications viewed by Admin are cleared for that admin only.
  const note = `<div class="team-rules-note" style="padding:0.5rem 0; color:var(--text-muted); font-size:0.9rem;">🔔 Notification rule: When an Admin views notifications, they are marked as seen for that Admin only.</div>`;
  container.innerHTML = note + appData.teams.map(t => `
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
      <td data-label="Assigned Teams">${u.role === 'admin' ? 'All teams' : (getUserTeamIds(u).join(', ') || 'No teams allotted')}</td>
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
  if (currentUser?.role !== 'admin') {
    alert('Only administrators can manage user IDs and passwords.');
    return;
  }

  const form = document.getElementById('userForm');
  form.reset();
  const teamSelect = document.getElementById('newUserTeams');
  teamSelect.innerHTML = appData.teams.map(teamId => `<option value="${teamId}">${teamId}</option>`).join('');

  if (userId) {
    const u = appData.users.find(x => x.id === userId);
    if (u) {
      document.getElementById('userModalTitle').textContent = 'Edit User ID & Password';
      document.getElementById('userEditId').value = u.id;
      document.getElementById('newUserName').value = u.name || '';
      document.getElementById('newUserUsername').value = u.username;
      document.getElementById('newUserPassword').value = u.password;
      document.getElementById('newUserRole').value = u.role;
      const assignedTeamIds = getUserTeamIds(u);
      Array.from(teamSelect.options).forEach(option => {
        option.selected = assignedTeamIds.includes(option.value);
      });
    }
  } else {
    document.getElementById('userModalTitle').textContent = 'Add New User Account';
    document.getElementById('userEditId').value = '';
  }

  updateUserTeamAssignmentVisibility();
  document.getElementById('userModal').classList.remove('hidden');
}

function updateUserTeamAssignmentVisibility() {
  const teamGroup = document.getElementById('userTeamsGroup');
  const teamSelect = document.getElementById('newUserTeams');
  const isIncharge = document.getElementById('newUserRole')?.value === 'incharge';
  if (teamGroup) teamGroup.classList.toggle('hidden', !isIncharge);
  if (teamSelect) teamSelect.required = isIncharge;
}

async function handleSaveUser(e) {
  e.preventDefault();
  if (currentUser?.role !== 'admin') {
    alert('Only administrators can change user IDs, passwords, or roles.');
    return;
  }

  const id = document.getElementById('userEditId').value;
  const name = document.getElementById('newUserName').value.trim();
  const username = document.getElementById('newUserUsername').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;
  const assignedTeamIds = Array.from(document.getElementById('newUserTeams').selectedOptions || [])
    .map(option => option.value)
    .filter(Boolean);

  if (role === 'incharge' && assignedTeamIds.length === 0) {
    alert('Assign at least one team to a Student Incharge.');
    return;
  }

  const existing = appData.users.find(u => u.username === username && u.id !== id);
  if (existing) {
    alert(`Username "${username}" already exists! Choose a different Username / User ID.`);
    return;
  }

  if (id) {
    const idx = appData.users.findIndex(u => u.id === id);
    if (idx >= 0) {
      appData.users[idx] = { ...appData.users[idx], name, username, password, role, assignedTeamIds };
      if (currentUser.id === id) {
        currentUser = appData.users[idx];
        sessionStorage.setItem('attendance_session_user', JSON.stringify(currentUser));
        document.getElementById('userNameDisplay').textContent = currentUser.name || currentUser.username;
        document.getElementById('userRoleDisplay').textContent = currentUser.role.toUpperCase();
      }
    }
    alert(`User account "${username}" updated successfully!`);
  } else {
    appData.users.push({ id: 'u_' + Date.now(), name, username, password, role, assignedTeamIds });
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

    const wasActiveSession = logoutUserSessionIfActive(userId);

    if (currentUser && currentUser.id === userId) {
      alert('You have deleted your own account. You have been logged out immediately.');
    } else if (wasActiveSession) {
      alert(`User account "${targetUser.username}" was deleted and that session was logged out immediately.`);
    } else {
      alert(`User account "${targetUser.username}" removed.`);
    }
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}
