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
global.XLSX = { utils: { json_to_sheet() { return {}; }, book_new() { return {}; }, book_append_sheet() {} }, writeFile() {} };
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
