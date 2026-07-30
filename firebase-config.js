// Firebase Configuration (Configured for Project: finearts-e0cac)

const firebaseConfig = {
  apiKey: "AIzaSyACErA8q3MXXeNvHgxyRyY9URyUBDBR_wA",
  authDomain: "finearts-e0cac.firebaseapp.com",
  databaseURL: "https://finearts-e0cac-default-rtdb.firebaseio.com",
  projectId: "finearts-e0cac",
  storageBucket: "finearts-e0cac.firebasestorage.app",
  messagingSenderId: "539295589830",
  appId: "1:539295589830:web:5807017ca6c3c20387fec7"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  console.log("🔥 Firebase initialized for project finearts-e0cac!");
}
