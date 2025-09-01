import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, addDoc, onSnapshot, collection, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your actual Firebase configuration from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyC8GGN2dLImqUPXIIYoYItg7WJSVIwgow",
  authDomain: "autonomous-agent-platform.firebaseapp.com",
  projectId: "autonomous-agent-platform",
  storageBucket: "autonomous-agent-platform.firebasestorage.app",
  messagingSenderId: "629997046233",
  appId: "1:629997046233:web:ab40772d6fc77adcccf1c8",
  measurementId: "G-BGZV9Z7M70"
};

// FIXED: Use a simple app ID
const appId = "autonomous-agent-platform";

// --- Firebase Initialization and Authentication ---
let app, auth, db, userId;

const initFirebase = async () => {
    try {
        // Initialize Firebase
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        // Sign in anonymously (simpler than custom tokens)
        const userCredential = await signInAnonymously(auth);
        userId = userCredential.user.uid;
        
        console.log(`Successfully authenticated with user ID: ${userId}`);
        document.getElementById('user-id-display').textContent = userId;
        
        // Start listening for changes once authenticated
        setupFirestoreListener();
    } catch (error) {
        console.error("Firebase authentication error:", error);
        // Show error to user
        document.getElementById('user-id-display').textContent = "Error: Firebase not configured";
    }
};

// Initialize when script loads
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
        statusText.textContent = 'Please enter a prompt to generate leads.';
        statusArea.classList.remove('hidden');
        return;
    }

    if (!userId) {
        statusText.textContent = 'Error: Not authenticated. Please refresh the page.';
        statusArea.classList.remove('hidden');
        return;
    }

    statusArea.classList.remove('hidden');
    statusText.textContent = 'Triggering AI Agent Pipeline...';
    generateButton.disabled = true;

    // Your n8n webhook URL
    const webhookUrl = 'https://clake37.app.n8n.cloud/webhook/24f2a44f-99d8-46ea-a700-6a7e2662fe31'; 

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                prompt: userPrompt, 
                userId: userId,
                appId: appId
            }),
        });

        if (!response.ok) {
            throw new Error(`Webhook failed with status: ${response.status}`);
        }

        const result = await response.json();
        console.log("n8n webhook response:", result);

        statusText.textContent = 'Agent pipeline triggered. New leads will appear shortly!';
        
        // Clear input
        promptInput.value = '';
        
        // Hide status after 3 seconds
        setTimeout(() => {
            statusArea.classList.add('hidden');
        }, 3000);

    } catch (error) {
        statusText.textContent = 'Error: ' + error.message;
        console.error('Webhook error:', error);
    } finally {
        generateButton.disabled = false;
    }
}

// --- Real-time Firestore Listener ---
const setupFirestoreListener = () => {
    if (!db || !userId) {
        console.error("Firestore not initialized. Cannot set up listener.");
        return;
    }
    
    // Listen to the exact path that n8n will write to
    const leadsCollection = collection(db, `artifacts/${appId}/users/${userId}/leads`);
    const q = query(leadsCollection);

    onSnapshot(q, (snapshot) => {
        const leads = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Handle both direct text and structured lead data
            if (typeof data === 'string') {
                // If n8n saves the AI response directly as text
                leads.push({
                    id: doc.id,
                    content: data,
                    timestamp: new Date()
                });
            } else {
                // If n8n saves structured data
                leads.push({ 
                    id: doc.id, 
                    ...data 
                });
            }
        });
        
        if (leads.length > 0) {
            renderLeads(leads);
            statusArea.classList.add('hidden');
        }
    }, (error) => {
        console.error("Firestore listener error:", error);
        statusText.textContent = "Error loading leads: " + error.message;
    });
};

function renderLeads(leads) {
    leadsContainer.innerHTML = ''; // Clear previous leads
    
    leads.forEach((lead, index) => {
        const leadCard = document.createElement('div');
        leadCard.className = 'lead-card p-6 fade-in';
        
        // Handle different data formats
        let content = '';
        if (lead.content) {
            content = lead.content;
        } else if (typeof lead === 'string') {
            content = lead;
        } else {
            content = JSON.stringify(lead, null, 2);
        }
        
        leadCard.innerHTML = `
            <h3 class="text-xl font-bold text-blue-600">Lead #${index + 1}</h3>
            <p class="text-sm text-gray-500 mb-4">Generated: ${new Date().toLocaleString()}</p>
            <div class="bg-gray-100 p-4 rounded-lg">
                <pre class="text-sm text-gray-800 whitespace-pre-wrap">${content}</pre>
            </div>
            <div class="flex justify-end mt-4">
                <button class="copy-button bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg transition-colors duration-200">Copy Content</button>
            </div>
        `;
        
        // Add copy functionality
        leadCard.querySelector('.copy-button').addEventListener('click', (event) => {
            const button = event.target;
            const content = button.closest('.lead-card').querySelector('pre').textContent;
            
            navigator.clipboard.writeText(content).then(() => {
                button.textContent = 'Copied!';
                button.classList.add('active');
                setTimeout(() => {
                    button.textContent = 'Copy Content';
                    button.classList.remove('active');
                }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                const tempInput = document.createElement('textarea');
                tempInput.value = content;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                
                button.textContent = 'Copied!';
                button.classList.add('active');
                setTimeout(() => {
                    button.textContent = 'Copy Content';
                    button.classList.remove('active');
                }, 2000);
            });
        });

        leadsContainer.appendChild(leadCard);
    });
}