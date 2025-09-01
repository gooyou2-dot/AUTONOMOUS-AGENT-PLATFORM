import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, addDoc, onSnapshot, collection, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Use a debug log level to see detailed Firestore logs in the console
setLogLevel('debug');

// MANDATORY: Use __app_id and __firebase_config for Firebase initialization
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Firebase Initialization and Authentication ---
let app, auth, db, userId;

const initFirebase = async () => {
    if (Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is missing. The app will not function correctly.");
        return;
    }
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        userId = auth.currentUser?.uid || crypto.randomUUID(); // Use a random ID for anonymous users
        console.log(`Successfully authenticated with user ID: ${userId}`);
        document.getElementById('user-id-display').textContent = userId;
        setupFirestoreListener(); // Start listening for changes once authenticated
    } catch (error) {
        console.error("Firebase authentication error:", error);
    }
};

// Call the initialization function when the script loads
initFirebase();

// --- UI Elements and Event Listeners ---
const promptInput = document.getElementById('prompt-input');
const generateButton = document.getElementById('generate-button');
const statusArea = document.getElementById('status-area');
const statusText = document.getElementById('status-text');
const leadsContainer = document.getElementById('leads-container');

generateButton.addEventListener('click', generateLeads);

async function generateLeads() {
    const userPrompt = promptInput.value.trim();
    if (!userPrompt) {
        console.error('Please enter a prompt to generate leads.');
        return;
    }

    statusArea.classList.remove('hidden');
    statusText.textContent = 'Triggering AI Agent Pipeline...';
    generateButton.disabled = true;

    // This is the new part: The frontend now calls our new backend endpoint
    const backendEndpointUrl = 'https://clake37.app.n8n.cloud/webhook/24f2a44f-99d8-46ea-a700-6a7e2662fe31'; 

    try {
        const response = await fetch(backendEndpointUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: userPrompt, userId: userId }),
        });

        if (!response.ok) {
            throw new Error(`Endpoint call failed with status: ${response.status}`);
        }

        const result = await response.json();
        console.log("Backend response:", result);

        statusText.textContent = 'Agent pipeline triggered. New leads will appear shortly!';
    } catch (error) {
        statusText.textContent = 'Error: ' + error.message;
        console.error('API call error:', error);
    } finally {
        generateButton.disabled = false;
    }
}

// --- Firestore Operations ---
async function saveLeadsToFirestore(leads) {
    if (!db || !userId) {
        console.error("Firestore is not initialized.");
        return;
    }
    const userLeadsCollection = collection(db, `artifacts/${appId}/users/${userId}/leads`);
    for (const lead of leads) {
        await addDoc(userLeadsCollection, {
            ...lead,
            status: 'New',
            timestamp: serverTimestamp()
        });
    }
}

function renderLeads(leads) {
    leadsContainer.innerHTML = ''; // Clear previous leads
    leads.forEach(lead => {
        const leadCard = document.createElement('div');
        leadCard.className = 'lead-card p-6 fade-in';
        leadCard.innerHTML = `
            <h3 class="text-xl font-bold text-blue-600">${lead.name}</h3>
            <p class="text-sm text-gray-500 mb-4">${lead.location}</p>
            <p class="text-lg font-medium text-gray-700">${lead.subjectLine}</p>
            <div class="bg-gray-100 p-4 rounded-lg mt-4">
                <pre class="text-sm text-gray-800 whitespace-pre-wrap">${lead.personalizedEmail}</pre>
            </div>
            <div class="flex justify-end mt-4">
                <button class="copy-button bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded-lg transition-colors duration-200">Copy Email</button>
            </div>
            <div class="mt-4 border-t pt-4">
                <h4 class="text-md font-semibold mb-2">Research Notes:</h4>
                <p class="text-sm text-gray-600">${lead.researchNotes}</p>
            </div>
        `;
        leadCard.querySelector('.copy-button').addEventListener('click', (event) => {
            const button = event.target;
            const content = button.closest('.lead-card').querySelector('pre').textContent;
            
            const tempInput = document.createElement('textarea');
            tempInput.value = content;
            document.body.appendChild(tempInput);
            tempInput.select();
            
            try {
                document.execCommand('copy');
                button.textContent = 'Copied!';
                button.classList.add('active');
                setTimeout(() => {
                    button.textContent = 'Copy Email';
                    button.classList.remove('active');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
            document.body.removeChild(tempInput);
        });

        leadsContainer.appendChild(leadCard);
    });
}

// --- Real-time Firestore Listener ---
const setupFirestoreListener = () => {
    if (!db || !userId) {
        console.error("Firestore not initialized. Cannot set up listener.");
        return;
    }
    const leadsCollection = collection(db, `artifacts/${appId}/users/${userId}/leads`);
    const q = query(leadsCollection);

    onSnapshot(q, (snapshot) => {
        const leads = [];
        snapshot.forEach((doc) => {
            leads.push({ id: doc.id, ...doc.data() });
        });
        renderLeads(leads);
    }, (error) => {
        console.error("Firestore onSnapshot error:", error);
        statusText.textContent = "Error loading leads.";
    });
};
