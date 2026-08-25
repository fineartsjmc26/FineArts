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

// Write workbook to a downloadable file in-browser, test-friendly and with Node fallback.
async function downloadWorkbook(wb, fname) {
  try { globalThis._lastXlsxAttempt = (globalThis._lastXlsxAttempt || 0) + 1; } catch (e) {}
  try {
    if (typeof XLSX !== 'undefined' && typeof XLSX.write === 'function') {
      const arrayBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([arrayBuf], { type: 'application/octet-stream' });
      try { globalThis._lastXlsxBlob = blob; globalThis._lastXlsxFileName = fname; } catch (e) {}
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (a && a.parentNode) a.parentNode.removeChild(a);
      }, 2000);
      return;
    }
  } catch (e) {
    try { globalThis._lastXlsxError = String(e); } catch (err) {}
    console.warn('XLSX.write fallback used', e && e.message);
  }

  // Fallback to writeFile when available (node tests mock this)
  if (typeof XLSX !== 'undefined' && typeof XLSX.writeFile === 'function') {
    try { globalThis._lastXlsxFileName = fname; } catch (e) {}
    XLSX.writeFile(wb, fname);
    return;
  }

  throw new Error('No XLSX write method available');
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

  document.getElementById('logoutBtn').addEventListener('click', () => {
    logoutCurrentUser();
  });
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
  // Student Master filters wiring
  ['studentFilterTeam','studentFilterDeptName','studentFilterDept','studentFilterYear'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderStudentsTable);
  });
  document.getElementById('applyStudentFiltersBtn')?.addEventListener('click', renderStudentsTable);

  document.getElementById('clearDateFilterBtn').addEventListener('click', () => {
    document.getElementById('filterDate').value = '';
    renderRecordsTable();
  });

  document.getElementById('deleteDateBtn').addEventListener('click', deleteAttendanceDate);
  document.getElementById('deleteMonthBtn').addEventListener('click', deleteAttendanceMonth);
  const onlyFiveHourDatesBtn = document.getElementById('onlyFiveHourDatesBtn');
  if (onlyFiveHourDatesBtn) {
    onlyFiveHourDatesBtn.addEventListener('click', toggleOnlyFiveHourDatesFilter);
  }
  // Export columns select-all wiring
  const exportColsSelectAll = document.getElementById('exportColumnsSelectAll');
  if (exportColsSelectAll) {
    exportColsSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('.export-col-checkbox').forEach(cb => { cb.checked = checked; });
    });
    // update select-all when individual checkboxes are toggled
    document.querySelectorAll('.export-col-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        exportColsSelectAll.checked = Array.from(document.querySelectorAll('.export-col-checkbox')).every(x => x.checked);
      });
    });
  }
  // Student Export columns select-all wiring
  const studentExportColsSelectAll = document.getElementById('studentExportColsSelectAll');
  if (studentExportColsSelectAll) {
    studentExportColsSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('.student-export-col-checkbox').forEach(cb => { cb.checked = checked; });
    });
    document.querySelectorAll('.student-export-col-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        studentExportColsSelectAll.checked = Array.from(document.querySelectorAll('.student-export-col-checkbox')).every(x => x.checked);
      });
    });
  }
  // Removed direct export from Attendance History here so the Export button
  // reuses the Student Export modal (exports filtered/selected student data).
  document.getElementById('studentSearchInput').addEventListener('input', renderStudentsTable);
  document.getElementById('clearStudentSearchBtn').addEventListener('click', () => {
    document.getElementById('studentSearchInput').value = '';
    renderStudentsTable();
  });
  // Student Directory filter controls removed from the UI; skip binding their handlers.
  

  document.getElementById('openAddStudentModalBtn').addEventListener('click', () => openStudentModal());
  const exportStudentsBtn = document.getElementById('exportStudentsBtn');
  if (exportStudentsBtn) exportStudentsBtn.addEventListener('click', () => startStudentExport(undefined, { previewOnly: false, format: 'excel' }));
  const studentOnlyFiveHourBtn = document.getElementById('studentOnlyFiveHourBtn');
  if (studentOnlyFiveHourBtn) studentOnlyFiveHourBtn.addEventListener('click', toggleOnlyFiveHourDatesFilter);
  // Bind export handler to any Export Excel buttons (some UI layouts had duplicate IDs)
  const exportExcelBtns = document.querySelectorAll('#exportExcelBtn');
  if (exportExcelBtns && exportExcelBtns.length) {
    exportExcelBtns.forEach(btn => btn.addEventListener('click', exportToExcel));
  }
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

// Student Export Modal & Logic
globalThis.startStudentExport = startStudentExport;

// Student export modal removed — exports are triggered directly from buttons.



function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('hidden');
}

async function startStudentExport(columns, options = {}) {
  try { window._startStudentExportTrace = window._startStudentExportTrace || []; window._startStudentExportTrace.push({when:Date.now(), step:'startStudentExport_enter'}); } catch (e) {}
  // If called without `columns` read selections from UI modal (new flow)
  let selectedCols = [];
  let headers = [];
  if (Array.isArray(columns) && columns.length) {
    selectedCols = columns.map(c => c.key);
    headers = columns.map(c => c.label);
  } else {
    const inputs = Array.from(document.querySelectorAll('#exportColumnsList input[type="checkbox"]'));
    if (inputs && inputs.length) {
      inputs.forEach(i => {
        if (i.checked) {
          const key = i.dataset.key || i.getAttribute('data-key') || i.id.replace(/^exportField_/, '');
          selectedCols.push(i.dataset.key || i.getAttribute('data-key'));
        }
      });
    } else {
      // No modal export columns list; try Student Master column checkboxes
      const studentCols = Array.from(document.querySelectorAll('.student-export-col-checkbox'));
      if (studentCols && studentCols.length) {
        studentCols.forEach(i => {
          if (i.checked) selectedCols.push(i.dataset.key || i.getAttribute('data-key'));
        });
      } else {
        // No modal or student checkbox UI present — fall back to a sane default column set
        selectedCols = ['name', 'rollNumber', 'registerNumber', 'mobile', 'deptName', 'year', 'department', 'section', 'attendancePercent'];
      }
    }
    // map keys to friendly headers
    const labelMap = {
      name: 'Student Name', rollNumber: 'Roll Number', registerNumber: 'Register Number', mobile: 'Mobile Number',
      deptName: 'Department Name', year: 'Year', department: 'Department Category', section: 'Section', teamIds: 'Assign Event Teams',
      hoursPresent: 'Hours Present', hoursAbsent: 'Hours Absent', attendancePercent: 'Attendance %'
    };
    headers = selectedCols.map(k => labelMap[k] || k);
  }

  try { window._startStudentExportTrace.push({when:Date.now(), step:'cols_selected', cols: selectedCols.length}); } catch (e) {}

  // format selection (excel or word). Allow callers to override via options.format when modal is removed.
  const format = options.format || (document.getElementById('exportFormatWord') && document.getElementById('exportFormatWord').checked ? 'word' : 'excel');
  const previewOnly = Boolean(options.previewOnly);
  // gather filter selections for Year/Department from Student Master filters
  const yearSelect = document.getElementById('studentFilterYear');
  const deptSelect = document.getElementById('studentFilterDept');
  const searchInput = document.getElementById('studentSearchInput');
  const selectedYears = yearSelect ? Array.from(yearSelect.selectedOptions).map(o => o.value).filter(Boolean) : [];
  const selectedDepts = deptSelect ? Array.from(deptSelect.selectedOptions).map(o => o.value).filter(Boolean) : [];
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const exportAll = !(selectedYears.length || selectedDepts.length || searchQuery);

  // show filter summary in preview area by reading both Student Master and Attendance History controls
  function renderExportFilterSummary() {
    const fs = document.getElementById('exportFiltersSummary');
    if (!fs) return;
    const parts = [];

    // Student Master filters
    const sYear = document.getElementById('studentFilterYear');
    const sDept = document.getElementById('studentFilterDept');
    const sSearch = document.getElementById('studentSearchInput');
    const selectedYears = sYear ? Array.from(sYear.selectedOptions).map(o => o.value).filter(Boolean) : [];
    const selectedDepts = sDept ? Array.from(sDept.selectedOptions).map(o => o.value).filter(Boolean) : [];
    const searchVal = sSearch ? sSearch.value.trim() : '';
    if (selectedYears.length) parts.push(`Years: ${selectedYears.join(', ')}`);
    if (selectedDepts.length) parts.push(`Departments: ${selectedDepts.join(', ')}`);
    if (searchVal) parts.push(`Search: "${searchVal}"`);

    // Attendance History filters
    const hTeamEl = document.getElementById('filterTeam');
    const hDeptNameEl = document.getElementById('filterDeptName');
    const hDeptCatEl = document.getElementById('filterDept');
    const hYearEl = document.getElementById('filterYear');
    const hDateEl = document.getElementById('filterDate');
    const hTeam = hTeamEl ? hTeamEl.value : '';
    const hDeptName = hDeptNameEl ? hDeptNameEl.value : '';
    const hDeptCat = hDeptCatEl ? hDeptCatEl.value : '';
    const hYear = hYearEl ? hYearEl.value : '';
    const hDate = hDateEl ? hDateEl.value : '';
    if (hTeam && hTeam !== 'ALL') parts.push(`Team: ${hTeam}`);
    if (hDeptName && hDeptName !== 'ALL') parts.push(`Dept Name: ${hDeptName}`);
    if (hDeptCat && hDeptCat !== 'ALL') parts.push(`Dept Category: ${hDeptCat}`);
    if (hYear && hYear !== 'ALL') parts.push(`Year: ${hYear}`);
    if (hDate) parts.push(`Date: ${hDate}`);

    fs.textContent = parts.length ? parts.join(' · ') : 'No filters applied';
    return fs.textContent;
  }

  // Prepare a function to fetch rows. Prefer Firestore-level querying when possible.
  let rows = [];
  const canQueryFirestore = !!firestoreDb && localStorage.getItem(OFFLINE_MODE_KEY) !== 'true';

  if (canQueryFirestore) {
    try {
      const colRef = firestoreDb.collection('students');
      const yearVals = (selectedYears.length && !selectedYears.includes('ALL')) ? selectedYears : [];
      const deptVals = (selectedDepts.length && !selectedDepts.includes('ALL')) ? selectedDepts : [];

      // Choose a primary filter to apply at DB level (prefer smaller list)
      let primaryField = null;
      let primaryVals = [];
      let secondaryField = null;
      let secondaryVals = [];
      if (yearVals.length && deptVals.length) {
        if (yearVals.length <= deptVals.length) {
          primaryField = 'year'; primaryVals = yearVals; secondaryField = 'deptName'; secondaryVals = deptVals;
        } else {
          primaryField = 'deptName'; primaryVals = deptVals; secondaryField = 'year'; secondaryVals = yearVals;
        }
      } else if (yearVals.length) { primaryField = 'year'; primaryVals = yearVals; }
      else if (deptVals.length) { primaryField = 'deptName'; primaryVals = deptVals; }

      const results = [];
      if (primaryField && primaryVals.length) {
        // Firestore 'in' supports up to 10 values per query; batch if needed.
        const batches = [];
        for (let i = 0; i < primaryVals.length; i += 10) batches.push(primaryVals.slice(i, i + 10));
        for (const batch of batches) {
          let q = colRef.where(primaryField, 'in', batch);
          // optionally apply a single equality secondary filter when only one value
          if (secondaryField && secondaryVals.length === 1) q = q.where(secondaryField, '==', secondaryVals[0]);
          const snap = await q.get();
          snap.forEach(doc => results.push(doc.data()));
        }
      } else {
        // no primary filter selected — fetch all and filter client-side
        const snap = await colRef.get();
        snap.forEach(doc => results.push(doc.data()));
      }

      // client-side apply secondary filter if necessary
      if (secondaryField && secondaryVals.length) {
        rows = results.filter(r => secondaryVals.includes(r[secondaryField]));
      } else {
        rows = results;
      }

      // If user selected 'filtered' scope, also apply search query client-side
      if (!exportAll) {
        const searchQuery = document.getElementById('studentSearchInput').value.toLowerCase();
        rows = rows.filter(s => (s.name || '').toLowerCase().includes(searchQuery) || (s.rollNumber || '').toLowerCase().includes(searchQuery) || (s.registerNumber || '').toLowerCase().includes(searchQuery) || ((s.deptName || '').toLowerCase().includes(searchQuery)));
      }
    } catch (err) {
      console.warn('Firestore student query failed, falling back to local filtering.', err && err.message);
      // fallback to local
      rows = appData.students.slice();
    }
  } else {
    // client-side filtering from appData
    rows = appData.students.slice();
    if (!exportAll) {
      const searchQuery = document.getElementById('studentSearchInput').value.toLowerCase();
      rows = rows.filter(s => (s.name || '').toLowerCase().includes(searchQuery) || (s.rollNumber || '').toLowerCase().includes(searchQuery) || (s.registerNumber || '').toLowerCase().includes(searchQuery) || ((s.deptName || '').toLowerCase().includes(searchQuery)));
    }
    if (selectedYears.length && !selectedYears.includes('ALL')) rows = rows.filter(s => selectedYears.includes(s.year || ''));
    if (selectedDepts.length && !selectedDepts.includes('ALL')) rows = rows.filter(s => selectedDepts.includes(s.deptName || s.department || ''));
  }

  try { window._startStudentExportTrace.push({when:Date.now(), step:'rows_fetched', rows: Array.isArray(rows) ? rows.length : null}); } catch (e) {}

  // If Firestore was queried but returned no rows, fall back to local `appData.students` when available.
  if (canQueryFirestore && Array.isArray(rows) && rows.length === 0 && Array.isArray(appData?.students) && appData.students.length > 0) {
    try {
      rows = appData.students.slice();
      if (!exportAll) {
        const searchQuery = document.getElementById('studentSearchInput').value.toLowerCase();
        rows = rows.filter(s => (s.name || '').toLowerCase().includes(searchQuery) || (s.rollNumber || '').toLowerCase().includes(searchQuery) || (s.registerNumber || '').toLowerCase().includes(searchQuery) || ((s.deptName || '').toLowerCase().includes(searchQuery)));
      }
      if (selectedYears.length && !selectedYears.includes('ALL')) rows = rows.filter(s => selectedYears.includes(s.year || ''));
      if (selectedDepts.length && !selectedDepts.includes('ALL')) rows = rows.filter(s => selectedDepts.includes(s.deptName || s.department || ''));
      try { window._startStudentExportTrace.push({when:Date.now(), step:'rows_fallback_to_local', rows: rows.length}); } catch (e) {}
    } catch (e) {
      // ignore fallback failures
    }
  }

  // Additionally, respect Attendance History filters (team/date/department/year) when present.
  // This ensures exports from the Attendance History area only include students who appear
  // in attendance records matching the selected history filters.
  try {
    const hTeamVal = document.getElementById('filterTeam') ? document.getElementById('filterTeam').value : '';
    const hDateVal = document.getElementById('filterDate') ? document.getElementById('filterDate').value : '';
    const hDeptNameVal = document.getElementById('filterDeptName') ? document.getElementById('filterDeptName').value : '';
    const hDeptVal = document.getElementById('filterDept') ? document.getElementById('filterDept').value : '';
    const hYearVal = document.getElementById('filterYear') ? document.getElementById('filterYear').value : '';

    const anyHistoryFilter = (hTeamVal && hTeamVal !== 'ALL') || hDateVal || (hDeptNameVal && hDeptNameVal !== 'ALL') || (hDeptVal && hDeptVal !== 'ALL') || (hYearVal && hYearVal !== 'ALL');
    if (anyHistoryFilter && Array.isArray(appData.attendance)) {
      const studentIds = new Set();
      appData.attendance.forEach(record => {
        if (hTeamVal && hTeamVal !== 'ALL' && record.teamId !== hTeamVal) return;
        if (hDateVal && record.date !== hDateVal) return;
        if (hDeptNameVal && hDeptNameVal !== 'ALL' && record.deptName && record.deptName !== hDeptNameVal) return;
        if (hDeptVal && hDeptVal !== 'ALL' && record.department && record.department !== hDeptVal) return;
        if (hYearVal && hYearVal !== 'ALL' && record.year && record.year !== hYearVal) return;
        const map = record.studentAttendanceMap || {};
        const onlyFive = isOnlyFiveHourAttendanceFilterEnabled();
        Object.keys(map).forEach(sid => {
          if (!onlyFive) { studentIds.add(sid); return; }
          const entry = map[sid] || {};
          if (entry && (entry.h1 !== undefined || entry.h2 !== undefined || entry.h3 !== undefined || entry.h4 !== undefined || entry.h5 !== undefined)) {
            // require at least presence of hour fields (treat as 5-hour record if keys exist)
            studentIds.add(sid);
          }
        });
      });
      if (studentIds.size > 0) {
        rows = rows.filter(s => studentIds.has(s.id));
      } else {
        // If history filters were applied but no attendance records match, result should be empty
        rows = [];
      }
    }
  } catch (e) {
    // ignore DOM read errors and proceed with current rows
  }

  try { window._startStudentExportTrace.push({when:Date.now(), step:'after_history_filter', rows: Array.isArray(rows) ? rows.length : null}); } catch (e) {}

  if (!rows || rows.length === 0) {
    // expose debug info for automated tests / browser checks
    try { window._lastStudentExportRows = Array.isArray(rows) ? rows.length : 0; window._lastStudentExportRowsSample = Array.isArray(rows) ? rows.slice(0,5) : []; } catch (e) {}
    // When no rows match the selected filters/scope, avoid disruptive alerts.
    // Show a non-blocking message in the export preview area (if available)
    // so users can adjust filters without a modal alert.
    const previewContainer = document.getElementById('exportPreviewContainer');
    if (previewContainer) {
      previewContainer.innerHTML = '<div style="color:var(--text-muted)">No student records found for the selected filters/scope.</div>';
    }
    return;
  }

  // Selection model removed: always export visible/filtered rows.

  // enforce permission: non-admins can only export students in their teams (best-effort fallback)
  if (currentUser?.role !== 'admin') {
    const permittedTeams = getUserTeamIds(currentUser);
    if (permittedTeams && permittedTeams.length) {
      rows = rows.filter(s => {
        const studentTeams = Array.isArray(s.teamIds) ? s.teamIds : (s.teamId ? [s.teamId] : []);
        return studentTeams.some(t => permittedTeams.includes(t));
      });
    } else {
      // no explicit permissions found on user object — block export for safety
      alert('You do not have permission to export student data for any department/year. Contact an administrator.');
      return;
    }
  }

  // enforce allowed departments/years if present on user profile
  if (currentUser?.role !== 'admin') {
    if (Array.isArray(currentUser.allowedDepartments) && currentUser.allowedDepartments.length) {
      rows = rows.filter(s => currentUser.allowedDepartments.includes(s.deptName || s.department || ''));
    }
    if (Array.isArray(currentUser.allowedYears) && currentUser.allowedYears.length) {
      rows = rows.filter(s => currentUser.allowedYears.includes(s.year || ''));
    }
    // if after enforcement no rows remain, block
    if (!rows.length) {
      alert('No records available to export within your permitted departments/years.');
      return;
    }
  }

  // Sorting: group by Finance Type (department category), then Year (using appData.years order), Department Name, Student Name, then Roll/Register
  const yearOrder = Array.isArray(appData.years) ? appData.years : [];
  function rollKey(s) {
    const r = s.rollNumber || s.registerNumber || '';
    const num = (r || '').match(/\d+/);
    return num ? Number(num[0]) : r.toString();
  }
  rows.sort((a, b) => {
    // Group by Finance Type first
    const fa = (a.department || '').toString();
    const fb = (b.department || '').toString();
    if (fa !== fb) return fa.localeCompare(fb);

    // Within group: Department Name A-Z
    const da = (a.deptName || '').toString();
    const db = (b.deptName || '').toString();
    if (da !== db) return da.localeCompare(db);

    // Year using appData.years order
    const ay = yearOrder.indexOf(a.year || '');
    const by = yearOrder.indexOf(b.year || '');
    if (ay !== by) return (ay === -1 ? 9999 : ay) - (by === -1 ? 9999 : by);

    // Section A-Z
    const sa = (a.section || '').toString();
    const sb = (b.section || '').toString();
    if (sa !== sb) return sa.localeCompare(sb);

    // Student Name A-Z
    const na = (a.name || '').toString();
    const nb = (b.name || '').toString();
    if (na !== nb) return na.localeCompare(nb);

    // Fallback: roll/register
    const ra = rollKey(a);
    const rb = rollKey(b);
    if (typeof ra === 'number' && typeof rb === 'number') return ra - rb;
    return String(ra).localeCompare(String(rb));
  });

  try { window._startStudentExportTrace.push({when:Date.now(), step:'after_sort', rows: rows.length}); } catch (e) {}

  // For preview: show first up to 50 rows and return
  if (previewOnly) {
    renderExportFilterSummary();
    const previewSubset = rows.slice(0, 5);
    // map rows for preview including computed attendance metrics
    const mappedPreview = previewSubset.map(s => {
      const out = {};
      selectedCols.forEach(k => {
        if (k === 'hoursPresent' || k === 'hoursAbsent') {
          const m = computeStudentAttendanceMetrics(s.studentId || s.id || s.rollNumber, document.getElementById('filterDate')?.value || '', document.getElementById('filterTeam')?.value || '');
          out[k] = k === 'hoursPresent' ? (m.totalScheduled ? Number((m.hoursPresent).toFixed(1)) : 0) : (m.totalScheduled ? Number((m.hoursAbsent).toFixed(1)) : 0);
        } else {
          out[k] = s[k] == null ? '' : (Array.isArray(s[k]) ? s[k].join(', ') : s[k]);
        }
      });
      out.department = s.department || s.department || '';
      return out;
    });
    renderExportPreview(mappedPreview, selectedCols, headers);
    return;
  }

  // Build filters text for export metadata by reading both Student Master and Attendance History controls
  const filtersText = renderExportFilterSummary() || 'No filters applied';

  // Attendance filters used for computing hours present/absent
  const hTeamVal = document.getElementById('filterTeam') ? document.getElementById('filterTeam').value : '';
  const hDateVal = document.getElementById('filterDate') ? document.getElementById('filterDate').value : '';

  function getStudentAttendanceCounts(studentId) {
      // compute totals and consider overrides
      let present = 0;
      let absent = 0;
      let totalScheduled = 0;
      if (!Array.isArray(appData.attendance)) return { present: 0, absent: 0, totalScheduled: 0 };
      appData.attendance.forEach(record => {
        if (hTeamVal && hTeamVal !== 'ALL' && record.teamId !== hTeamVal) return;
        if (hDateVal && record.date !== hDateVal) return;
        const entry = record.studentAttendanceMap && record.studentAttendanceMap[studentId];
        if (!entry) return;
        ['h1','h2','h3','h4','h5'].forEach(hourKey => {
          const v = entry[hourKey];
          if (v != null && v !== '') {
            totalScheduled += 1;
            if (v === 'P') present += 1; else absent += 1;
          }
        });
      });

      // apply any manual overrides from appData.attendanceOverrides
      if (Array.isArray(appData.attendanceOverrides)) {
        appData.attendanceOverrides.forEach(ov => {
          if (ov.studentId !== studentId) return;
          if (hDateVal && ov.date !== hDateVal) return;
          if (hTeamVal && hTeamVal !== 'ALL' && ov.teamId && ov.teamId !== hTeamVal) return;
          if (ov.field === 'hoursPresent') {
            present = Number(ov.newValue) || present;
          }
          if (ov.field === 'hoursAbsent') {
            absent = Number(ov.newValue) || absent;
          }
        });
      }

      return { present, absent, totalScheduled };
  }

  // If user chose Word format, prepare a single .docx with grouping and return
  if (format === 'word') {
    try {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const HH = String(now.getHours()).padStart(2, '0');
      const MIN = String(now.getMinutes()).padStart(2, '0');
      const SS = String(now.getSeconds()).padStart(2, '0');
      const shortFilter = (filtersText || 'All').slice(0,80).replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '_') || 'All';
      const filename = `student_details_${yyyy}${mm}${dd}_${shortFilter}.docx`;

      // map rows for display values
      const mapped = rows.map(s => {
        const out = {};
        selectedCols.forEach(k => {
          let v = s[k];
          if (Array.isArray(v)) v = v.join(', ');
          if (v == null) v = '';
          out[k] = v;
        });
        // keep department value for grouping
        out.department = s.department || s.department || '';
        return out;
      });

      // include filtersText as metadata paragraph at top of the Word doc
      await exportToWord(mapped, selectedCols, headers, filename, filtersText);
      alert('Exported Word document.');
      // studentExportModal removed — no modal to close
      return;
    } catch (err) {
      console.error('Word export failed', err);
      alert('Word export failed: ' + (err && err.message ? err.message : 'Unknown error'));
    }
  }

  // Max-row guard — prevent accidental massive exports; recommend filtering or contact admin
  const MAX_ROWS_HARD = 200000;
  if (rows.length > MAX_ROWS_HARD) {
    alert('Export too large (' + rows.length + ' rows). Please narrow filters or contact an administrator to export a large dataset.');
    return;
  }

  // prepare export data mapping with formatting
  const mapRow = (student) => {
    const out = {};
    selectedCols.forEach(k => {
      let v = student[k];
      // compute hours present/absent when requested
      if (k === 'hoursPresent' || k === 'hoursAbsent') {
        const counts = getStudentAttendanceCounts(student.id);
        v = k === 'hoursPresent' ? counts.present : counts.absent;
      }
      // arrays like teamIds -> join
      if (Array.isArray(v)) v = v.join(', ');

      // normalize dates: keep as Date objects when possible so Excel treats as dates
      if (v && (k.toLowerCase().includes('date') || k.toLowerCase() === 'dob' || /enroll|enrollment|dob|date/i.test(k))) {
        const d = new Date(v);
        if (!isNaN(d)) v = d; else v = '';
      }

      // phone numbers as text (preserve leading zeros) - prefix with apostrophe to force text in Excel
      if (v != null && (k.toLowerCase().includes('mobile') || k.toLowerCase().includes('phone'))) {
        v = String(v);
        if (v && !v.startsWith("'")) v = `'${v}`;
      }

      // numeric fields: attempt parse
      if (v != null && (['gpa', 'feesDue', 'attendancePercent', 'attendance_percent'].includes(k) || /gpa|fee|amount|percent|attendance/i.test(k))) {
        const n = Number(String(v).replace(/[^0-9.+-]/g, ''));
        if (!isNaN(n)) v = n;
      }

      out[k] = v == null ? '' : v;
    });
    // include internal ids and attendance metrics for export formatting
    const metrics = computeStudentAttendanceMetrics(student.id, hDateVal, hTeamVal);
    out._studentId = student.id;
    out._totalScheduled = metrics.totalScheduled || 0;
    out._hoursPresent = Number((metrics.hoursPresent || 0));
    out._hoursAbsent = Number((metrics.hoursAbsent || 0));
    out._attendancePercent = out._totalScheduled ? Number(((out._hoursPresent / out._totalScheduled) * 100).toFixed(2)) : 0;
    // format selected percentage field if included
    if (selectedCols.includes('attendancePercent')) out['attendancePercent'] = out._totalScheduled ? `${out._attendancePercent.toFixed(2)}%` : '0.00%';
    return out;
  };

  // headers are already provided from the `columns` parameter as `headers`

  // show progress UI
  document.getElementById('studentExportProgress').style.display = 'block';
  const progressBar = document.getElementById('studentExportProgressBar');
  const progressText = document.getElementById('studentExportProgressText');
  progressBar.value = 0;
  progressText.textContent = 'Preparing export...';

  try {
    // handle large dataset splitting per-file if too many rows
    const total = rows.length;
    const maxPerFile = 50000;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const MIN = String(now.getMinutes()).padStart(2, '0');
    const SS = String(now.getSeconds()).padStart(2, '0');

    const parts = Math.ceil(total / maxPerFile);
    for (let part = 0; part < parts; part++) {
      const start = part * maxPerFile;
      const end = Math.min(total, start + maxPerFile);
      // For each subset prepare mapped rows, and also insert group header rows where Finance Type changes
      const rawSubset = rows.slice(start, end);
      const subset = [];
      let lastDept = null;
      rawSubset.forEach(s => {
        const deptCat = s.department || '';
        if (deptCat !== lastDept) {
          const hdr = {};
          // place group header text in first selected column
          selectedCols.forEach((k, idx) => {
            hdr[k] = idx === 0 ? `Finance Type: ${deptCat || 'Unspecified'}` : '';
          });
          subset.push(hdr);
          lastDept = deptCat;
        }
        subset.push(mapRow(s));
      });

      // create workbook for this part
      const workbook = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(subset, { header: selectedCols });

      // helper: shift sheet rows down by `shift` to make room for filter metadata
      function shiftSheetDown(sheet, shift) {
        const out = {};
        const range = sheet['!ref'];
        Object.keys(sheet).forEach(addr => {
          if (addr[0] === '!') return; // skip metadata
          const m = addr.match(/^([A-Z]+)(\d+)$/i);
          if (!m) return;
          const col = m[1];
          const row = parseInt(m[2], 10);
          const newAddr = col + (row + shift);
          out[newAddr] = sheet[addr];
        });
        // adjust range
        if (range) {
          const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
          if (m) {
            out['!ref'] = `${m[1]}${parseInt(m[2], 10) + shift}:${m[3]}${parseInt(m[4], 10) + shift}`;
          }
        }
        return out;
      }

      // shift existing sheet down by 3 rows to make room for metadata (Filters, Exported, Total)
      const shifted = shiftSheetDown(ws, 3);

      // set header labels on row 4 (r:3)
      selectedCols.forEach((k, idx) => {
        const cellAddress = typeof XLSX?.utils?.encode_cell === 'function'
          ? XLSX.utils.encode_cell({ c: idx, r: 3 })
          : `${String.fromCharCode(65 + idx)}4`;
        if (!shifted[cellAddress]) shifted[cellAddress] = {};
        shifted[cellAddress].v = headers[idx];
      });

      // insert metadata rows in first column: Filters (A1), Exported timestamp (A2), Total Records (A3)
      const exportedAt = new Date().toISOString();
      shifted['A1'] = { t: 's', v: `Filters: ${filtersText}` };
      shifted['A2'] = { t: 's', v: `Exported: ${exportedAt}` };
      shifted['A3'] = { t: 's', v: `Total Records: ${rows.length}` };

      // replace ws with shifted
      ws['!ref'] = shifted['!ref'];
      Object.keys(ws).forEach(k => delete ws[k]);
      Object.keys(shifted).forEach(k => ws[k] = shifted[k]);

      // set reasonable column widths and types
      ws['!cols'] = selectedCols.map(k => {
        // wider for names, addresses; narrow for small numeric fields
        const key = k.toLowerCase();
        if (key.includes('name')) return { wch: 28 };
        if (key.includes('address') || key.includes('dept') || key.includes('register')) return { wch: 22 };
        if (key.includes('mobile') || key.includes('phone')) return { wch: 14 };
        if (key.includes('date') || key === 'dob' || key.includes('enroll')) return { wch: 14 };
        if (key.includes('percent') || key.includes('gpa') || key.includes('fee') || key.includes('amount')) return { wch: 12 };
        return { wch: Math.max(10, Math.min(30, headers[selectedCols.indexOf(k)]?.length * 1.5 || 12)) };
      });
      XLSX.utils.book_append_sheet(workbook, ws, 'Students');

      // build a sanitized filter summary for filename per required pattern
      const shortFilter = (filtersText || 'All').slice(0,80).replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '_') || 'All';
      const partSuffix = parts > 1 ? `_part${part + 1}` : '';
      const filename = `student_details_${yyyy}${mm}${dd}_${shortFilter}${partSuffix}.xlsx`;

      await downloadWorkbook(workbook, filename);

      const pct = Math.round(Math.min(100, ((end) / total) * 100));
      if (progressBar) {
        progressBar.value = pct;
        progressText.textContent = `Exported ${end} of ${total} records (${pct}%)`;
      }

      try { window._startStudentExportTrace.push({when:Date.now(), step:'before_write', part, start, end}); } catch (e) {}
      // attempt download
      await downloadWorkbook(workbook, filename);
      try { window._startStudentExportTrace.push({when:Date.now(), step:'after_write', part, start, end}); } catch (e) {}

      // yield to UI so progress updates show
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    progressBar.value = 100;
    progressText.textContent = `Export completed (${total} records)`;
    alert(`Export successful: ${parts} file(s) generated`);
    // studentExportModal removed — no modal to close
  } catch (err) {
    console.error('Student export failed', err);
    alert('Student export failed: ' + (err && err.message ? err.message : 'Unknown error'));
    progressText.textContent = 'Export failed';
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

  const studentFilterTeam = document.getElementById('studentFilterTeam');
  if (studentFilterTeam) studentFilterTeam.innerHTML = `<option value="ALL">All Teams</option>` + appData.teams.map(t => `<option value="${t}">${t}</option>`).join('');

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
  const studentFilterDeptName = document.getElementById('studentFilterDeptName');
  if (studentFilterDeptName) studentFilterDeptName.innerHTML = `<option value="ALL">All Department Names</option>` + appData.departments.map(d => `<option value="${d}">${d}</option>`).join('');
  const studentFilterDept = document.getElementById('studentFilterDept');
  if (studentFilterDept) studentFilterDept.innerHTML = '<option value="ALL">All (Aided & Self-Finance)</option><option value="Aided">Aided</option><option value="Self-Finance">Self-Finance</option>';

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

function sortStudents(left, right) {
  const leftCategoryRank = left.department === 'Aided' ? 0 : left.department === 'Self-Finance' ? 1 : 2;
  const rightCategoryRank = right.department === 'Aided' ? 0 : right.department === 'Self-Finance' ? 1 : 2;
  if (leftCategoryRank !== rightCategoryRank) return leftCategoryRank - rightCategoryRank;

  const leftYear = getYearSortValue(left.year);
  const rightYear = getYearSortValue(right.year);
  if (leftYear !== rightYear) return leftYear - rightYear;

  const leftDeptName = String(left.deptName || '').trim().toUpperCase();
  const rightDeptName = String(right.deptName || '').trim().toUpperCase();
  if (leftDeptName !== rightDeptName) return leftDeptName.localeCompare(rightDeptName);

  const leftName = String(left.name || '').trim().toUpperCase();
  const rightName = String(right.name || '').trim().toUpperCase();
  if (leftName !== rightName) return leftName.localeCompare(rightName);

  const leftRoll = String(left.rollNumber || '').trim();
  const rightRoll = String(right.rollNumber || '').trim();
  if (leftRoll !== rightRoll) return leftRoll.localeCompare(rightRoll);

  const leftRegister = String(left.registerNumber || '').trim();
  const rightRegister = String(right.registerNumber || '').trim();
  return leftRegister.localeCompare(rightRegister);
}

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
  const newRecord = {
    id: index >= 0 ? appData.attendance[index].id : 'att_' + Date.now(),
    teamId, date, studentAttendanceMap,
    markedBy: currentUser.name || currentUser.username,
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
      message: `Attendance for ${teamId} on ${date} was completely marked by ${newRecord.markedBy}.`,
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
      message: `Student Incharge ${currentUser.name || currentUser.username} marked attendance for ${teamId} on ${date}.`,
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
      message: `You marked attendance for ${teamId} on ${date}. Marked students are now locked across teams.`,
      read: false,
      timestamp: new Date().toISOString()
    });
  }

  if (index >= 0) appData.attendance[index] = newRecord;
  else appData.attendance.push(newRecord);

  await saveAppData();
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

function isOnlyFiveHourAttendanceFilterEnabled() {
  const btnA = document.getElementById('onlyFiveHourDatesBtn');
  const btnB = document.getElementById('studentOnlyFiveHourBtn');
  const check = (el) => {
    if (!el) return false;
    if (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'active')) return el.dataset.active === 'true';
    return el.classList?.contains('active') || false;
  };
  return check(btnA) || check(btnB);
}

function toggleOnlyFiveHourDatesFilter() {
  const active = !isOnlyFiveHourAttendanceFilterEnabled();
  // update both possible buttons if present
  const btnMain = document.getElementById('onlyFiveHourDatesBtn');
  const btnStudent = document.getElementById('studentOnlyFiveHourBtn');
  [btnMain, btnStudent].forEach(btn => {
    if (!btn) return;
    btn.dataset.active = String(active);
    btn.setAttribute('aria-pressed', String(active));
    btn.textContent = active ? '5-Hour Export: ON' : '5-Hour Export: OFF';
    btn.classList.toggle('active', active);
  });
  renderRecordsTable();
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
    // compute attendance metrics for this student/date
    const metrics = computeStudentAttendanceMetrics(r.rollNumber, r.date, r.teamName);
    const hoursPresentVal = Number((metrics.hoursPresent).toFixed(1));
    const hoursAbsentVal = Number((metrics.hoursAbsent).toFixed(1));
    const pct = metrics.totalScheduled > 0 ? ((metrics.hoursPresent / metrics.totalScheduled) * 100).toFixed(2) + '%' : '0.00%';
    const recId = `${r.studentId}__${r.date}__${r.teamName}`;
    tr.innerHTML = `
      <td style="text-align:center"><input type="checkbox" class="record-select-row" data-id="${recId}" ${globalThis.selectedExportRecords.has(recId) ? 'checked' : ''}></td>
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
      <td data-label="Hours Present" style="text-align:center;"><input class="input-control" type="number" step="0.1" value="${hoursPresentVal}" data-student="${r.rollNumber}" data-date="${r.date}" data-field="hoursPresent" style="width:80px"></td>
      <td data-label="Hours Absent" style="text-align:center;"><input class="input-control" type="number" step="0.1" value="${hoursAbsentVal}" data-student="${r.rollNumber}" data-date="${r.date}" data-field="hoursAbsent" style="width:80px"></td>
      <td data-label="Attendance %" style="text-align:center;">${pct}</td>
      <td data-label="Marked By">${r.markedBy}</td>
    `;
    tbody.appendChild(tr);
  });

  // wire selection checkbox handlers for visible record rows
  Array.from(tbody.querySelectorAll('.record-select-row')).forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) globalThis.selectedExportRecords.add(id); else globalThis.selectedExportRecords.delete(id);
      const allVisible = Array.from(tbody.querySelectorAll('.record-select-row'));
      const header = document.getElementById('recordsSelectAll');
      if (header) header.checked = allVisible.length && allVisible.every(x => x.checked);
    });
  });
  const recordsSelectAll = document.getElementById('recordsSelectAll');
  if (recordsSelectAll) {
    recordsSelectAll.checked = Array.from(tbody.querySelectorAll('.record-select-row')).every(x => x.checked);
    recordsSelectAll.onchange = () => {
      Array.from(tbody.querySelectorAll('.record-select-row')).forEach(cb => { cb.checked = recordsSelectAll.checked; const id = cb.dataset.id; if (recordsSelectAll.checked) globalThis.selectedExportRecords.add(id); else globalThis.selectedExportRecords.delete(id); });
    };
  }
  // wire change handlers for override inputs (audit trail)
  Array.from(tbody.querySelectorAll('input[data-field]')).forEach(input => {
    input.addEventListener('change', (e) => {
      const newVal = Number(input.value);
      const studentId = input.dataset.student;
      const date = input.dataset.date;
      const field = input.dataset.field;
      // find previous value via compute
      const prev = computeStudentAttendanceMetrics(studentId, date, document.getElementById('filterTeam').value)[field === 'hoursPresent' ? 'hoursPresent' : 'hoursAbsent'];
      // store override
      if (!Array.isArray(appData.attendanceOverrides)) appData.attendanceOverrides = [];
      appData.attendanceOverrides.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2,8), studentId, date, teamId: document.getElementById('filterTeam').value, field, previousValue: prev, newValue: newVal, modifiedBy: currentUser?.id || 'unknown', timestamp: new Date().toISOString() });
      // append to audit trail
      if (!Array.isArray(appData.auditTrail)) appData.auditTrail = [];
      appData.auditTrail.push({ studentId, date, field, previousValue: prev, newValue: newVal, modifiedBy: currentUser?.id || 'unknown', timestamp: new Date().toISOString() });
      // re-render records table to reflect changes
      renderRecordsTable();
    });
  });
}

async function exportToExcel() {
  const filterDateVal = document.getElementById('filterDate').value;
  const filterTeamVal = document.getElementById('filterTeam').value;
  const filterDeptNameVal = document.getElementById('filterDeptName').value;
  const filterDeptVal = document.getElementById('filterDept').value;
  const { rowList } = getSortedFilteredAttendanceRows();
  const onlyFiveHourActive = Boolean(document.getElementById('onlyFiveHourDatesBtn')?.dataset?.active === 'true');

  let exportRows = onlyFiveHourActive
    ? [...rowList].sort((left, right) => {
        const leftStudent = appData.students.find(student => student.id === left.studentId) || {
          department: left.department,
          deptName: left.deptName,
          year: left.year,
          name: left.studentName,
          rollNumber: left.rollNumber,
          registerNumber: left.registerNumber,
        };
        const rightStudent = appData.students.find(student => student.id === right.studentId) || {
          department: right.department,
          deptName: right.deptName,
          year: right.year,
          name: right.studentName,
          rollNumber: right.rollNumber,
          registerNumber: right.registerNumber,
        };
        return sortStudents(leftStudent, rightStudent);
      })
    : rowList;

  // If user has selected specific records in the table, export only selected ones
  if (globalThis.selectedExportRecords && globalThis.selectedExportRecords.size > 0) {
    const sel = new Set(globalThis.selectedExportRecords);
    exportRows = exportRows.filter(r => sel.has(`${r.studentId}__${r.date}__${r.teamName}`));
    if (exportRows.length === 0) {
      alert('No selected attendance records to export.');
      return;
    }
  }

  // Determine which columns to include from the UI checkboxes
  const checkedCols = Array.from(document.querySelectorAll('.export-col-checkbox:checked')).map(cb => cb.dataset.col);
  if (!checkedCols || checkedCols.length === 0) {
    alert('Please select at least one column to include in the export.');
    return;
  }

  // Ensure each student appears only once per date in the exported sheet
  try {
    const seen = new Set();
    exportRows = exportRows.filter(r => {
      const key = `${r.studentId}__${r.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (e) {
    // ignore and continue if structure unexpected
  }

  const exportData = exportRows.map(row => {
    const out = { 'Date': row.date };
    checkedCols.forEach(col => {
      switch (col) {
        case 'Student Name': out[col] = row.studentName || ''; break;
        case 'Roll Number': out[col] = row.rollNumber || ''; break;
        case 'Register Number': out[col] = row.registerNumber || ''; break;
        case 'Dept Name': out[col] = row.deptName || ''; break;
        case 'Section': out[col] = row.section || ''; break;
        case 'Mobile': out[col] = row.mobile || '';
          break;
        case 'Category': out[col] = row.department || '';
          break;
        case 'Team': out[col] = row.teamName || '';
          break;
        case 'Year': out[col] = row.year || '';
          break;
        case 'H1': out[col] = row.h1 || ''; break;
        case 'H2': out[col] = row.h2 || ''; break;
        case 'H3': out[col] = row.h3 || ''; break;
        case 'H4': out[col] = row.h4 || ''; break;
        case 'H5': out[col] = row.h5 || ''; break;
        default:
          out[col] = row[col] || '';
      }
    });
    // Uppercase student-related string fields (except Date and H1-H5)
    Object.keys(out).forEach(k => {
      if (k === 'Date') return;
      if (['H1','H2','H3','H4','H5'].includes(k)) return;
      if (typeof out[k] === 'string') out[k] = out[k].toUpperCase();
    });
    return out;
  });

  if (exportData.length === 0) {
    alert('No data available to export with current date & filters!');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "5_Hour_Attendance_Report");

  // set column widths: Date + selected columns
  worksheet['!cols'] = [ { wch: 12 } ].concat(checkedCols.map(c => ({ wch: (c.length > 12 ? 18 : 12) })));

  const fileName = `5_Hour_Attendance_Report_${filterDateVal || new Date().toISOString().split('T')[0]}.xlsx`;
  await downloadWorkbook(workbook, fileName);
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

  // gather selected year/department filters
  const yearSelect = document.getElementById('studentFilterYear');
  const deptNameSelect = document.getElementById('studentFilterDeptName');
  const deptCatSelect = document.getElementById('studentFilterDept');
  const teamSelect = document.getElementById('studentFilterTeam');
  const selectedYears = yearSelect ? Array.from(yearSelect.selectedOptions).map(o => o.value) : [];
  const selectedDeptNames = deptNameSelect ? Array.from(deptNameSelect.selectedOptions).map(o => o.value) : [];
  const selectedDeptCats = deptCatSelect ? Array.from(deptCatSelect.selectedOptions).map(o => o.value) : [];
  const selectedTeam = teamSelect ? teamSelect.value : 'ALL';

  const filtered = appData.students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery) ||
      (s.rollNumber || '').toLowerCase().includes(searchQuery) ||
      (s.registerNumber || '').toLowerCase().includes(searchQuery) ||
      ((s.deptName || '').toLowerCase().includes(searchQuery));

    let matchesYear = true;
    if (selectedYears && selectedYears.length && !selectedYears.includes('ALL')) {
      matchesYear = selectedYears.includes(s.year || '');
    }

    let matchesDeptName = true;
    if (selectedDeptNames && selectedDeptNames.length && !selectedDeptNames.includes('ALL')) {
      matchesDeptName = selectedDeptNames.includes(s.deptName || '');
    }

    let matchesDeptCat = true;
    if (selectedDeptCats && selectedDeptCats.length && !selectedDeptCats.includes('ALL')) {
      matchesDeptCat = selectedDeptCats.includes(s.department || '');
    }

    let matchesTeam = true;
    if (selectedTeam && selectedTeam !== 'ALL') {
      matchesTeam = getStudentTeamIds(s).includes(selectedTeam);
    }

    return matchesSearch && matchesYear && matchesDeptName && matchesDeptCat && matchesTeam;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">No student records found.</td></tr>`;
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
      document.getElementById('studentModalTitle').textContent = 'Edit Student';
      document.getElementById('studentEditId').value = s.id;
      document.getElementById('studentName').value = s.name || '';
      document.getElementById('studentRoll').value = s.rollNumber || '';
      document.getElementById('studentRegister').value = s.registerNumber || '';
      document.getElementById('studentMobile').value = s.mobile || '';
      document.getElementById('studentDeptName').value = s.deptName || '';
      document.getElementById('studentYear').value = s.year || '';
      document.getElementById('studentDept').value = s.department || '';
      document.getElementById('studentSection').value = s.section || '';
      const studentTeam = document.getElementById('studentTeam');
      if (studentTeam) {
        Array.from(studentTeam.options).forEach(opt => { opt.selected = false; });
        const teamIds = Array.isArray(s.teamIds) ? s.teamIds : (s.teamId ? [s.teamId] : []);
        Array.from(studentTeam.options).forEach(opt => { if (teamIds.includes(opt.value)) opt.selected = true; });
      }
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

    if (currentUser.id === userId) {
      alert('You have deleted your own account. You will now be logged out.');
      logoutCurrentUser();
    } else {
      alert(`User account "${targetUser.username}" removed.`);
    }
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}
