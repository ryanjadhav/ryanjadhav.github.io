var firebaseConfig = {
  apiKey:            'AIzaSyDIu0AOSmH97CRSHgLPxtd21-1jDIs4HI0',
  authDomain:        'tetris-9fd80.firebaseapp.com',
  projectId:         'tetris-9fd80',
  storageBucket:     'tetris-9fd80.firebasestorage.app',
  messagingSenderId: '943274683445',
  appId:             '1:943274683445:web:9239bbb7a5fbd5dab0557c',
};
try {
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();
} catch (e) {}
