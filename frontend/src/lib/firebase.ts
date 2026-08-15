import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, setLogLevel, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json' with { type: 'json' };

// Mute SDK-internal stream disconnect/reconnect trace messages
setLogLevel('error');

const app = initializeApp(firebaseConfig);

// Initialize Firestore with databaseId and auto-detect long polling for container networks
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Connection Test
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Successfully connected to Firebase Firestore enterprise instance.');
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('CANCELLED'))) {
      console.warn('Firestore connectivity status:', error.message);
    }
  }
}

testFirestoreConnection();

