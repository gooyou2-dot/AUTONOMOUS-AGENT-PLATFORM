import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, onSnapshot, collection, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
        // No alert, just log the error to the console
        console.error('Please enter a prompt to generate leads.');
        return;
    }

    statusArea.classList.remove('hidden');
    statusText.textContent = 'Generating leads with AI agents...';
    generateButton.disabled = true;

    const systemPrompt = `
        You are an expert AI Agent specializing in lead generation and client engagement for commercial insurance agents. Your primary task is to take a natural language prompt from a user (a human insurance agent) and, using a multi-agent framework, generate a list of high-quality, hyper-personalized leads.

        **Your Internal Multi-Agent Workflow:**
        1.  **Prospecting Agent:** Based on the user's prompt, identify a hyper-specific niche (e.g., "commercial P&C leads for contractors in Dallas"). Simulate a web scrape of publicly available data (business names, locations, websites).
        2.  **Research & Enrichment Agent:** For each identified lead, simulate a "stalker-like" research process. Use the business name and website to infer their pain points, recent news, and any other relevant details that could be used for a personalized outreach.
        3.  **Copywriting Agent:** Based on the enriched data, write a short, hyper-personalized cold email for each lead. The email should be concise and designed to start a conversation, not sell a policy. It should demonstrate that you've done your homework.
        4.  **Reporting Agent:** Compile all the information into a single, structured JSON format. The final output must be a JSON array of objects, with each object representing a single lead.

        **Strict JSON Output Format:**
        - The response MUST be a JSON array.
        - Each object in the array MUST contain the following properties:
            - \`name\`: The business name (string).
            - \`location\`: The city and state (string).
            - \`niche\`: The business niche (string, e.g., "contractors").
            - \`painPoints\`: A list of inferred pain points (array of strings).
            - \`personalizedEmail\`: The complete, personalized cold email copy (string).
            - \`subjectLine\`: A compelling, personalized subject line for the email (string).
            - \`researchNotes\`: A summary of your research for the human agent to review (string).

        **Example Prompt to me:** 'Find commercial property and casualty leads for contractors in Dallas, TX.'
        
        **Example of your expected JSON output:**
        \`\`\`json
        [
          {
            "name": "Acme Construction Solutions",
            "location": "Dallas, TX",
            "niche": "Construction",
            "painPoints": ["Risk management for large-scale projects", "Liability from subcontractors", "Securing job-specific bonds"],
            "personalizedEmail": "Hi [Prospect Name], I saw that Acme Construction recently broke ground on the new 'Catalina' project in Dallas. That sounds like a significant undertaking! As you know, large-scale projects come with unique risk management challenges. I specialize in helping contractors like you secure the right P&C coverage and job-specific bonds. Would you be open to a quick chat to discuss how to best protect this new project?",
            "subjectLine": "Quick question about the Catalina project",
            "researchNotes": "Acme is a construction company specializing in large-scale commercial and residential projects. They recently announced a new project via a press release. They have a strong online presence and a professional website. Key pain points are likely securing project-specific insurance and managing subcontractor liability."
          }
        ]
        \`\`\`

        **Your response must contain ONLY the JSON array.** No preamble, no explanation, no markdown outside of the JSON block.
    `;
    
    // --- Gemini API Call ---
    try {
        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            tools: [{ "google_search": {} }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            generationConfig: {
                responseMimeType: "application/json",
            },
        };
        const apiKey = ""; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API call failed with status: ${response.status}`);
        }

        const result = await response.json();
        const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonString) {
            throw new Error("API response was empty or malformed.");
        }

        const leads = JSON.parse(jsonString);

        // Add leads to Firestore
        await saveLeadsToFirestore(leads);

        statusText.textContent = 'Leads generated successfully!';
        
    } catch (error) {
        statusText.textContent = 'Error: ' + error.message;
        console.error('Lead generation error:', error);
    } finally {
        generateButton.disabled = false;
    }
}

// --- Firestore Operations ---
async function saveLeadsToFirestore(leads) {
    if (!db) {
        console.error("Firestore is not initialized.");
        return;
    }
    if (!userId) {
        console.error("User ID is not available.");
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
        // Add event listener for the copy button
        leadCard.querySelector('.copy-button').addEventListener('click', (event) => {
            const button = event.target;
            const content = button.closest('.lead-card').querySelector('pre').textContent;
            
            // Fallback for clipboard functionality
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
        // Log an error if Firebase is not yet initialized
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
