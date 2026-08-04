// Firebase Configuration for the active Firestore project

const firebaseConfig = {
  apiKey: "AIzaSyCBEY5VF7k3cXWqPSGRkhbM5Edw1oAqzJc",
  authDomain: "fineartsattendence-c7fd687b.firebaseapp.com",
  projectId: "fineartsattendence-c7fd687b",
  storageBucket: "fineartsattendence-c7fd687b.firebasestorage.app",
  messagingSenderId: "533898504157",
  appId: "1:533898504157:web:7aee88373c8c68da7e3834"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  console.log('🔥 Firebase initialized for project', firebaseConfig.projectId, 'authDomain', firebaseConfig.authDomain);
}
