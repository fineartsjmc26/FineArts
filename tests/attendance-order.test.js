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
global.firebase = { apps: [], database() { return { ref() { return { once() { return Promise.resolve({ val() { return null; } }); }, on() {} }; } }; } };
global.XLSX = { utils: { json_to_sheet() { return {}; }, book_new() { return {}; }, book_append_sheet() {} }, writeFile() {} };
global.alert = () => {};

require('../app.js');

const { getSortedFilteredAttendanceRows } = global;

const originalAppData = global.appData;
const originalStudents = global.appData?.students;

try {
  global.appData = {
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
  console.log('attendance-order test passed');
} finally {
  global.appData = originalAppData;
}
