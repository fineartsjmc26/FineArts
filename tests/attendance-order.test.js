const assert = require('assert');

const noopEl = () => ({
  value: '',
  innerHTML: '',
  textContent: '',
  style: {},
  classList: { add() {}, remove() {}, contains() { return false; } },
  addEventListener() {},
  appendChild() {},
  reset() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  setAttribute() {},
  getAttribute() { return null; },
});

global.document = {
  addEventListener() {},
  getElementById(id) {
    if (id === 'filterDate') return { value: '' };
    if (id === 'filterTeam') return { value: 'ALL' };
    if (id === 'filterDeptName') return { value: 'ALL' };
    if (id === 'filterDept') return { value: 'ALL' };
    return noopEl();
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return noopEl(); },
};
const originalGetElementById = global.document.getElementById;
global.window = {};
global.localStorage = { getItem() { return null; }, setItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.firebase = {
  apps: [],
  initializeApp() {},
  firestore() {
    return {
      enablePersistence() { return Promise.resolve(); },
      collection() {
        return {
          doc() {
            return {
              get() { return Promise.resolve({ data() { return { users: [{ id: 'u1', username: 'admin', password: 'admin123', role: 'admin', name: 'Admin' }], departments: ['CS'], sections: ['A'], teams: ['T1'], students: [], attendance: [] }; } }); },
              set() { return Promise.resolve(); },
              onSnapshot() { return () => {}; },
            };
          },
        };
      },
    };
  },
};
global.XLSX = {
  utils: {
    json_to_sheet() { return {}; },
    book_new() { return {}; },
    book_append_sheet() {},
    encode_cell({ c, r }) { return `${String.fromCharCode(65 + c)}${r + 1}`; },
  },
  writeFile() {},
};
global.alert = () => {};

global.fetch = async () => { throw new Error('unexpected fetch'); };

require('../app.js');

const { getSortedFilteredAttendanceRows, isStudentMarkedInAnotherTeam, sortStudents } = global;

 (async () => {
const originalAppData = global.appData;
const originalStudents = global.appData?.students;

try {
  global.appData = {
    notifications: [
      { id: 'n1', type: 'team-attendance-complete', message: 'Team 1 complete', read: false },
      { id: 'n2', type: 'incharge-attendance-saved', senderId: 'u2', message: 'Team 2 saved', read: false },
      { id: 'n3', type: 'other-event', message: 'Other event', read: false },
    ],
    attendance: [
      {
        teamId: 'Team Alpha',
        date: '2024-01-10',
        timestamp: '2024-01-10T08:00:00.000Z',
        studentAttendanceMap: { s1: { h1: 'P', h2: 'P', h3: 'P', h4: 'P', h5: 'P' } },
        markedBy: 'Admin',
      },
      {
        teamId: 'Team Beta',
        date: '2024-02-14',
        timestamp: '2024-02-14T09:00:00.000Z',
        studentAttendanceMap: { s1: { h1: 'A', h2: 'P', h3: 'P', h4: 'P', h5: 'P' } },
        markedBy: 'Admin',
      },
      {
        teamId: 'Team Gamma',
        date: '2024-03-01',
        studentAttendanceMap: { s1: { h1: 'P', h2: 'P', h3: 'P', h4: 'P', h5: 'P' } },
        markedBy: 'Admin',
      },
      {
        teamId: 'Team Delta',
        date: '2024-03-02',
        timestamp: '2024-02-14T09:00:00.000Z',
        studentAttendanceMap: { s1: { h1: 'P', h2: 'P', h3: 'P', h4: 'P', h5: 'P' } },
        markedBy: 'Admin',
      },
    ],
    students: [
      { id: 's1', name: 'Ada', rollNumber: '123', registerNumber: '456', deptName: 'Computer Science', department: 'Aided', section: 'A', teamId: 'Team Alpha', mobile: '999' },
    ],
  };

  const result = getSortedFilteredAttendanceRows();
  assert.deepStrictEqual(result.rowList.map(record => record.teamName), ['Team Beta', 'Team Delta', 'Team Alpha', 'Team Gamma']);

  assert.strictEqual(isStudentMarkedInAnotherTeam('s1', '2024-01-10', 'Team Beta'), true);
  assert.strictEqual(isStudentMarkedInAnotherTeam('s1', '2024-01-10', 'Team Alpha'), false);
  assert.strictEqual(isStudentMarkedInAnotherTeam('s1', '2024-02-14', 'Team Alpha'), true);
  assert.strictEqual(isStudentMarkedInAnotherTeam('s1', '2024-01-11', 'Team Beta'), false);

  assert.strictEqual(isStudentMarkedInAnotherTeam('s1', '2024-01-10', 'Team Beta'), true);
  assert.strictEqual(isStudentMarkedInAnotherTeam('s1', '2024-01-10', 'Team Alpha'), false);
  assert.strictEqual(isStudentMarkedInAnotherTeam('s1', '2024-02-14', 'Team Alpha'), true);
  assert.strictEqual(isStudentMarkedInAnotherTeam('s1', '2024-01-11', 'Team Beta'), false);

  global.currentUser = { id: 'u2', username: 'incharge1', role: 'incharge', name: 'Student Incharge 1', assignedTeamIds: ['Team Alpha'] };
  global.saveAppData = async () => {};
  global.renderNotifications = () => {};
  global.renderNotificationMenu = () => {};
  global.appData.notifications = [
    { id: 'n1', type: 'team-attendance-complete', message: 'Team 1 complete', read: false },
    { id: 'n2', type: 'incharge-attendance-saved', senderId: 'u2', message: 'Team 2 saved', read: false },
    { id: 'n3', type: 'other-event', message: 'Other event', read: false },
  ];
  clearNotificationsForCurrentUser();
  assert.deepStrictEqual(global.appData.notifications.map(n => n.id), ['n1', 'n3']);

  assert.ok(sortStudents instanceof Function);
  const unsortedStudents = [
    { name: 'Zoe', department: 'Self-Finance', deptName: 'Physics', rollNumber: '12', registerNumber: 'B400', year: '2nd Year' },
    { name: 'Alice', department: 'Aided', deptName: 'Computer Science', rollNumber: '3', registerNumber: 'A100', year: '1st Year' },
    { name: 'Bob', department: 'Aided', deptName: 'Computer Science', rollNumber: '2', registerNumber: 'A101', year: '1st Year' },
    { name: 'Carol', department: 'Self-Finance', deptName: 'Biology', rollNumber: '7', registerNumber: 'B200', year: '1st Year' },
    { name: 'Dora', department: 'Aided', deptName: 'Maths', rollNumber: '5', registerNumber: 'A200', year: '2nd Year' },
  ];
  const sorted = [...unsortedStudents].sort(sortStudents);
  assert.deepStrictEqual(sorted.map(s => `${s.department}|${s.year}|${s.deptName}|${s.name}`), [
    'Aided|1st Year|Computer Science|Alice',
    'Aided|1st Year|Computer Science|Bob',
    'Aided|2nd Year|Maths|Dora',
    'Self-Finance|1st Year|Biology|Carol',
    'Self-Finance|2nd Year|Physics|Zoe',
  ]);

  const exportedRows = [
    { studentName: 'Charlie', department: 'Aided', deptName: 'Computer Science', year: '1st Year', date: '2024-01-10', rollNumber: '4', registerNumber: 'A110' },
    { studentName: 'Alice', department: 'Aided', deptName: 'Computer Science', year: '1st Year', date: '2024-05-02', rollNumber: '3', registerNumber: 'A100' },
    { studentName: 'Bob', department: 'Aided', deptName: 'Computer Science', year: '1st Year', date: '2024-01-12', rollNumber: '2', registerNumber: 'A101' },
    { studentName: 'Zoe', department: 'Self-Finance', deptName: 'Physics', year: '2nd Year', date: '2024-05-02', rollNumber: '12', registerNumber: 'B400' },
    { studentName: 'Dora', department: 'Aided', deptName: 'Maths', year: '2nd Year', date: '2024-03-03', rollNumber: '5', registerNumber: 'A200' },
  ];

  const studentExportFilterCheck = {
    appData: {
      students: [
        { id: 's1', name: 'Ada', year: '1st Year', deptName: 'Computer Science', department: 'Aided', section: 'A', rollNumber: '11', registerNumber: 'CS11', mobile: '999', teamIds: ['Team Alpha'] },
        { id: 's2', name: 'Ben', year: '2nd Year', deptName: 'Computer Science', department: 'Aided', section: 'B', rollNumber: '12', registerNumber: 'CS12', mobile: '888', teamIds: ['Team Alpha'] },
        { id: 's3', name: 'Cora', year: '2nd Year', deptName: 'Electronics', department: 'Self-Finance', section: 'C', rollNumber: '13', registerNumber: 'EL13', mobile: '777', teamIds: ['Team Beta'] },
      ],
    },
  };
  const originalFilterYear = global.document.getElementById;
  global.document.getElementById = (id) => {
    if (id === 'studentFilterYear') return { value: '2nd Year' };
    if (id === 'studentFilterDept') return { value: 'Computer Science' };
    if (id === 'studentExportModal') return { classList: { remove() {}, add() {} } };
    if (id === 'exportColumnsList') return {
      querySelectorAll: () => [
        { checked: true, dataset: { key: 'name' } },
        { checked: true, dataset: { key: 'deptName' } },
        { checked: true, dataset: { key: 'section' } },
        { checked: true, dataset: { key: 'rollNumber' } },
        { checked: true, dataset: { key: 'registerNumber' } },
        { checked: true, dataset: { key: 'mobile' } },
        { checked: true, dataset: { key: 'team' } },
      ],
    };
    if (id === 'exportSelectAll') return { checked: true, onchange: null };
    if (id === 'cancelStudentExportBtn') return { addEventListener() {} };
    if (id === 'closeStudentExportModal') return { addEventListener() {} };
    if (id === 'startStudentExportBtn') return { addEventListener() {} };
    return originalFilterYear(id);
  };
  const originalAppState = global.appData;
  global.appData = studentExportFilterCheck.appData;
  const originalSheet = global.XLSX.utils.json_to_sheet;
  const originalQuerySelectorAll = global.document.querySelectorAll;
  let studentExportSheetData;
  global.XLSX.utils.json_to_sheet = (data) => {
    studentExportSheetData = data;
    return data;
  };
  global.document.querySelectorAll = (selector) => {
    if (selector === '#exportColumnsList input[type="checkbox"]') {
      return [
        { checked: true, dataset: { key: 'name' } },
        { checked: true, dataset: { key: 'deptName' } },
        { checked: true, dataset: { key: 'year' } },
        { checked: true, dataset: { key: 'section' } },
        { checked: true, dataset: { key: 'rollNumber' } },
        { checked: true, dataset: { key: 'registerNumber' } },
        { checked: true, dataset: { key: 'mobile' } },
        { checked: true, dataset: { key: 'team' } },
      ];
    }
    return [];
  };
  const filteredStudentExportResult = await global.startStudentExport();
  assert.strictEqual(filteredStudentExportResult.ok, true);
  assert.strictEqual(studentExportSheetData.length, 1);
  assert.strictEqual(studentExportSheetData[0]['Student Name'], 'Ben');
  assert.strictEqual(Object.keys(studentExportSheetData[0]).includes('Year'), true);
  assert.strictEqual(Object.keys(studentExportSheetData[0]).includes('Date'), false);
  assert.strictEqual(Object.keys(studentExportSheetData[0]).includes('Hour-wise attendance'), false);
  global.XLSX.utils.json_to_sheet = originalSheet;
  global.appData = originalAppState;
  global.document.getElementById = originalGetElementById;
  global.document.querySelectorAll = originalQuerySelectorAll;
  const sortedExportRows = exportedRows.slice().sort((left, right) => {
    const leftOut = { department: left.department, deptName: left.deptName, year: left.year, date: left.date, name: left.studentName, rollNumber: left.rollNumber, registerNumber: left.registerNumber };
    const rightOut = { department: right.department, deptName: right.deptName, year: right.year, date: right.date, name: right.studentName, rollNumber: right.rollNumber, registerNumber: right.registerNumber };
    return sortStudents(leftOut, rightOut);
  });
  assert.deepStrictEqual(sortedExportRows.map(r => `${r.department}|${r.year}|${r.studentName}|${r.rollNumber}`), [
    'Aided|1st Year|Alice|3',
    'Aided|1st Year|Bob|2',
    'Aided|1st Year|Charlie|4',
    'Aided|2nd Year|Dora|5',
    'Self-Finance|2nd Year|Zoe|12',
  ]);

  const descendingRows = [
    { department: 'Aided', year: '1st Year', deptName: 'Computer Science', name: 'Same Student', rollNumber: '2', registerNumber: 'A101' },
    { department: 'Aided', year: '1st Year', deptName: 'Computer Science', name: 'Same Student', rollNumber: '4', registerNumber: 'A110' },
    { department: 'Aided', year: '1st Year', deptName: 'Computer Science', name: 'Same Student', rollNumber: '3', registerNumber: 'A100' },
  ];
  const descendingSort = descendingRows.slice().sort((a, b) => global.sortStudentsWithDirection(a, b, { rollNumberDirection: 'desc', registerNumberDirection: 'desc' }));
  assert.deepStrictEqual(descendingSort.map(r => `${r.name}|${r.rollNumber}|${r.registerNumber}`), [
    'Same Student|4|A110',
    'Same Student|3|A100',
    'Same Student|2|A101',
  ]);

  global.XLSX.writeFile = function (...args) {
    global.__lastWriteFileArgs = args;
  };

  const originalJsonToSheet = global.XLSX.utils.json_to_sheet;
  let capturedSheetData = null;
  global.XLSX.utils.json_to_sheet = function (data) {
    capturedSheetData = data;
    return data;
  };

  global.appData = {
    attendance: [
      {
        teamId: 'Team Alpha',
        date: '2024-01-10',
        studentAttendanceMap: { s1: { h1: 'P', h2: 'P', h3: 'P', h4: 'P', h5: 'P' } },
        markedBy: 'Admin',
      },
      {
        teamId: 'Team Alpha',
        date: '2024-01-11',
        studentAttendanceMap: { s1: { h1: 'P', h2: 'P', h3: 'P', h4: 'P', h5: 'P' } },
        markedBy: 'Admin',
      },
    ],
    students: [
      { id: 's1', name: 'Ada', rollNumber: '123', registerNumber: '456', deptName: 'Computer Science', department: 'Aided', section: 'A', teamId: 'Team Alpha', year: 'First Year', mobile: '999' },
    ],
  };

  const attendanceExportModal = { classList: { remove() {}, add() {} } };
  global.document.getElementById = (id) => {
    if (id === 'attendanceExportModal') return attendanceExportModal;
    if (id === 'filterDate') return { value: '' };
    if (id === 'filterTeam') return { value: 'ALL' };
    if (id === 'filterDeptName') return { value: 'ALL' };
    if (id === 'filterDept') return { value: 'ALL' };
    if (id === 'filterYear') return { value: 'ALL' };
    return noopEl();
  };
  global.document.querySelectorAll = () => [
    { checked: true, dataset: { key: 'studentName' } },
    { checked: true, dataset: { key: 'section' } },
    { checked: true, dataset: { key: 'deptName' } },
    { checked: true, dataset: { key: 'department' } },
    { checked: true, dataset: { key: 'teamName' } },
    { checked: true, dataset: { key: 'hourWiseAttendance' } },
    { checked: true, dataset: { key: 'rollNumber' } },
    { checked: true, dataset: { key: 'registerNumber' } },
  ];
  global.selectedExportRecords = new Set(['s1__2024-01-10__Team Alpha', 's1__2024-01-11__Team Alpha']);
  global.exportToExcel();
  assert.strictEqual(Array.isArray(capturedSheetData) ? capturedSheetData.length : 0, 1);
  global.XLSX.utils.json_to_sheet = originalJsonToSheet;
  global.document.getElementById = originalGetElementById;

  const classList = () => {
    const set = new Set();
    return {
      add: (...cls) => cls.forEach(c => set.add(c)),
      remove: (...cls) => cls.forEach(c => set.delete(c)),
      contains: c => set.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (set.has(c)) { set.delete(c); return false; }
          set.add(c); return true;
        }
        if (force) set.add(c); else set.delete(c);
        return force;
      },
      set: set,
    };
  };

  const makeElement = (id) => {
    const el = {
      id,
      value: '',
      innerHTML: '',
      textContent: '',
      style: {},
      disabled: false,
      classList: classList(),
      children: [],
      appendChild(child) { this.children.push(child); return child; },
      addEventListener() {},
      setAttribute() {},
    };
    return el;
  };

  const markLockBanner = makeElement('markLockBanner');
  const saveAttendanceBtn = makeElement('saveAttendanceBtn');
  const batchActionBtns = makeElement('batchActionBtns');
  const unlockBtn = makeElement('unlockBtn');
  const inchargeUnlockBtn = makeElement('inchargeUnlockBtn');
  const attendanceMarkTbody = makeElement('attendanceMarkTbody');
  const markTeamSelect = makeElement('markTeamSelect');
  const markDate = makeElement('markDate');
  const markCategoryFilter = makeElement('markCategoryFilter');
  const markDeptNameFilter = makeElement('markDeptNameFilter');
  const markYearFilter = makeElement('markYearFilter');
  const teamStudentCountTitle = makeElement('teamStudentCountTitle');

  markTeamSelect.value = 'Team Alpha';
  markDate.value = '2024-01-10';
  markCategoryFilter.value = 'ALL';
  markDeptNameFilter.value = 'ALL';
  markYearFilter.value = 'ALL';

  const student = { id: 's1', name: 'Ada', rollNumber: '123', registerNumber: '456', deptName: 'Computer Science', department: 'Aided', section: 'A', teamId: 'Team Alpha', mobile: '999', year: 'First Year' };
  global.appData = {
    attendance: [{
      id: 'att_1',
      teamId: 'Team Alpha',
      date: '2024-01-10',
      studentAttendanceMap: { s1: { h1: 'P', h2: 'P', h3: 'P', h4: 'P', h5: 'P' } },
      locked: true,
      markedBy: 'Admin',
      unlockMode: 'admin',
    }],
    students: [student],
    teams: ['Team Alpha'],
    users: [{ id: 'u2', username: 'incharge1', password: 'user123', role: 'incharge', name: 'Student Incharge 1', assignedTeamIds: ['Team Alpha'] }],
  };
  global.currentUser = global.appData.users[0];

  const studentExportModal = {
    classList: { add() {}, remove() {} },
  };
  const studentExportProgress = { style: {}, textContent: '' };
  const progressBar = { value: 0 };
  const progressText = { textContent: '' };
  const studentFilterYear = { selectedOptions: [], options: [] };
  const studentFilterDept = { selectedOptions: [], options: [] };
  const studentSearchInput = { value: '' };

  global.document.getElementById = (id) => {
    if (id === 'studentExportModal') return studentExportModal;
    if (id === 'studentExportProgress') return studentExportProgress;
    if (id === 'studentExportProgressBar') return progressBar;
    if (id === 'studentExportProgressText') return progressText;
    if (id === 'studentFilterYear') return studentFilterYear;
    if (id === 'studentFilterDept') return studentFilterDept;
    if (id === 'studentSearchInput') return studentSearchInput;
    return originalGetElementById(id);
  };

  global.appData = {
    attendance: [{
      id: 'att_1',
      teamId: 'Team Alpha',
      date: '2024-01-10',
      studentAttendanceMap: { s1: { h1: 'P', h2: 'P', h3: 'P', h4: 'P', h5: 'P' } },
      locked: true,
      markedBy: 'Admin',
      unlockMode: 'admin',
    }],
    students: [
      { id: 's1', name: 'Ada', rollNumber: '123', registerNumber: '456', mobile: '999', deptName: 'Computer Science', department: 'Aided', year: 'First Year', section: 'A', teamId: 'Team Alpha' },
      { id: 's2', name: 'Ben', rollNumber: '124', registerNumber: '457', mobile: '888', deptName: 'Computer Science', department: 'Aided', year: 'Second Year', section: 'B', teamId: 'Team Alpha' },
    ],
    years: ['First Year', 'Second Year'],
    departments: ['Computer Science'],
    teams: ['Team Alpha'],
  };

  await assert.doesNotReject(async () => {
    await global.startStudentExport([
      { key: 'name', label: 'Name' },
      { key: 'year', label: 'Year' },
      { key: 'deptName', label: 'Department' },
    ]);
  });
  assert.ok(global.__lastWriteFileArgs && global.__lastWriteFileArgs.length > 0);
  global.document.getElementById = originalGetElementById;

  console.log('student export regression test ok');

  global.document.getElementById = (id) => {
    if (id === 'markTeamSelect') return markTeamSelect;
    if (id === 'markDate') return markDate;
    if (id === 'markCategoryFilter') return markCategoryFilter;
    if (id === 'markDeptNameFilter') return markDeptNameFilter;
    if (id === 'markYearFilter') return markYearFilter;
    if (id === 'attendanceMarkTbody') return attendanceMarkTbody;
    if (id === 'markLockBanner') return markLockBanner;
    if (id === 'saveAttendanceBtn') return saveAttendanceBtn;
    if (id === 'batchActionBtns') return batchActionBtns;
    if (id === 'unlockBtn') return unlockBtn;
    if (id === 'inchargeUnlockBtn') return inchargeUnlockBtn;
    if (id === 'teamStudentCountTitle') return teamStudentCountTitle;
    return makeElement(id);
  };

  global.currentUser = {
    id: 'u2',
    username: 'incharge1',
    role: 'incharge',
    name: 'Student Incharge 1',
    assignedTeamIds: ['Team Alpha'],
  };
  globalThis.renderAttendanceMarkingForm();
  assert.strictEqual(unlockBtn.classList.contains('hidden'), true);
  assert.strictEqual(inchargeUnlockBtn.classList.contains('hidden'), true);

  console.log('attendance order test passed');
} finally {
  global.appData = originalAppData;
}
})();
