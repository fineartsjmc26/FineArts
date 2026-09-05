// Firebase Configuration for the active Firestore project

const firebaseConfig = {
  apiKey: "AIzaSyCBEY5VF7k3cXWqPSGRkhbM5Edw1oAqzJc",
  authDomain: "fineartsattendence-c7fd687b.firebaseapp.com",
  projectId: "fineartsattendence-c7fd687b",
  storageBucket: "fineartsattendence-c7fd687b.firebasestorage.app",
  messagingSenderId: "533898504157",
  appId: "1:533898504157:web:7aee88373c8c68da7e3834"
};

window.firebaseConfig = firebaseConfig;

const firebaseConfigIsUsable = Boolean(
  firebaseConfig &&
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId &&
  firebaseConfig.authDomain
);

// Initialize Firebase only when the config is complete.
if (typeof firebase !== 'undefined') {
  if (!firebaseConfigIsUsable) {
    console.warn('Firebase config is incomplete. Local-only attendance mode will continue without Firestore sync.');
  } else if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
    console.log('🔥 Firebase initialized for project', firebaseConfig.projectId, 'authDomain', firebaseConfig.authDomain);
  } else {
    console.log('🔥 Firebase already initialized for project', firebaseConfig.projectId);
  }
} else {
  console.warn('Firebase SDK is unavailable. Local-only attendance mode will continue without remote sync.');
}
