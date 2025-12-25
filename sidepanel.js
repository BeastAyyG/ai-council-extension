
// --- HELPER: Notification System ---
function showStatus(message, type = 'normal') {
    const statusEl = document.getElementById("status");
    statusEl.innerText = message;

    // Reset classes
    statusEl.className = 'visible';

    if (type === 'error') statusEl.classList.add('error');
    if (type === 'success') statusEl.classList.add('success');

    // Auto-hide after 5s if it's just a normal message
    if (type === 'normal') {
        setTimeout(() => {
            statusEl.classList.remove('visible');
        }, 5000);
    }
}

// --- LISTENERS: Real-Time Status ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'status_update') {
        updateStatusCard(request.agent, request.state);
    }
});

function updateStatusCard(agent, state) {
    // agent: 'ChatGPT', 'Gemini', 'Claude'
    const cardId = `status-${agent.toLowerCase()}`;
    const card = document.getElementById(cardId);
    if (!card) return;

    // Reset
    card.classList.remove('active', 'done');

    if (state === 'working') {
        card.classList.add('active');
    } else if (state === 'idle') {
        card.classList.add('done');
    }
}


// --- BUTTON 1: ASK (Fire and Forget) ---
document.getElementById("askBtn").addEventListener("click", async () => {
    const question = document.getElementById("question").value;

    if (!question) {
        showStatus("Please type a question first!", 'error');
        return;
    }

    try {
        // 1. Reset UI
        document.querySelectorAll('.status-card').forEach(c => c.className = 'status-card');

        // 2. Save flags
        await chrome.storage.local.set({
            "user_question": question,
            "questionSent_chatgpt": false,
            "questionSent_gemini": false,
            "questionSent_claude": false
        });

        // 3. Open Tabs
        const tabs = await chrome.tabs.query({});
        const urls = {
            gpt: "https://chatgpt.com",
            gemini: "https://gemini.google.com/app",
            claude: "https://claude.ai/new"
        };

        const openOrReload = (urlKey, urlMatch) => {
            const tab = tabs.find(t => t.url && t.url.includes(urlMatch));
            if (tab) chrome.tabs.reload(tab.id);
            else chrome.tabs.create({ url: urls[urlKey], active: false });
        };

        openOrReload('gpt', 'chat.openai.com'); // chatgpt.com redirects here often
        openOrReload('gemini', 'gemini.google.com');
        openOrReload('claude', 'claude.ai');

        showStatus("Agents deployed! Watch the status cards above.", 'success');

    } catch (err) {
        showStatus("Error: " + err.message, 'error');
    }
});


// --- BUTTON 2: JUDGE ---
// --- HELPER: Markdown Parser ---
const parseMarkdown = (text) => {
    if (!text) return "";
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/### (.*?)\n/g, '<h3>$1</h3>')
        .replace(/- (.*?)\n/g, '<li>$1</li>')
        .replace(/\n\n/g, '<br><br>');
    html = html.replace(/<li>.*?<\/li>/g, match => `<ul>${match}</ul>`).replace(/<\/ul><ul>/g, '');
    return html;
};

// --- HELPER: View Switching ---
function switchView(viewName) {
    const inputView = document.getElementById('input-view');
    const resultsView = document.getElementById('results-view');

    if (viewName === 'results') {
        inputView.style.display = 'none';
        resultsView.style.display = 'block';
    } else {
        inputView.style.display = 'block';
        resultsView.style.display = 'none';
    }
}

// --- BUTTON 2: JUDGE ---
document.getElementById("judgeBtn").addEventListener("click", async () => {
    showStatus("Scraping answers from Council...", 'normal');

    try {
        const tabs = await chrome.tabs.query({});
        const findTab = (match) => tabs.find(t => t.url && t.url.includes(match));

        const gptTab = findTab('chat.openai.com') || findTab('chatgpt.com');
        const geminiTab = findTab('gemini.google.com');
        const claudeTab = findTab('claude.ai');

        if (!gptTab || !geminiTab || !claudeTab) {
            throw new Error("Missing tabs! Open Claude, ChatGPT, and Gemini.");
        }

        // 1. Get answers safely
        const getAnswer = (tabId, name) => {
            return chrome.tabs.sendMessage(tabId, { action: "scrape_answer" })
                .then(res => ({ name, text: res.answer }))
                .catch(err => ({ name, text: "", error: err.message }));
        };

        const results = await Promise.all([
            getAnswer(gptTab.id, 'ChatGPT'),
            getAnswer(geminiTab.id, 'Gemini'),
            getAnswer(claudeTab.id, 'Claude')
        ]);

        const validResults = results.filter(r => r.text && r.text.length > 5);

        if (validResults.length === 0) {
            throw new Error("No answers found! Wait for agents to finish.");
        }

        showStatus("Analysing...", 'normal');

        // 2. RENDER RESULTS IMMEDIATELY IN PANEL
        switchView('results');

        const updateCard = (id, result) => {
            const card = document.getElementById(id); // <details>
            const body = card.querySelector('.card-body');
            if (result) {
                body.innerHTML = parseMarkdown(result.text);
                card.style.opacity = "1";
            } else {
                body.innerText = "No answer generated.";
                card.style.opacity = "0.5";
            }
        };

        updateCard('card-chatgpt', results.find(r => r.name === 'ChatGPT'));
        updateCard('card-gemini', results.find(r => r.name === 'Gemini'));
        updateCard('card-claude', results.find(r => r.name === 'Claude'));

        // Reset Verdict UI
        const verdictEl = document.getElementById('verdict-content');
        verdictEl.innerText = "The Judge is deliberating...";
        verdictEl.className = "loading-text";

        // 3. Select Persona & Prompt Logic
        const persona = document.getElementById('judgePersona').value;
        const PERSONA_PROMPTS = {
            default: "Compare answers. Score them (0-10) and combine the best parts into one factual summary.",
            critic: "Role: Ruthless Critic. Tear apart these answers. Find logical fallacies, missing context, and hallucinations. Pick a winner, but explain why the others failed.",
            synthesizer: "Role: Master Synthesizer. Merge these distinct viewpoints into a single, cohesive, high-quality article. Do not mention 'ChatGPT said X', just present the unified truth.",
            coder: "Role: Senior Tech Lead. Review the code snippets. Which one is most efficient, secure, and modern? Ignore fluff. Output the best code block only."
        };

        const taskDescription = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.default;

        const inputs = validResults.map(r => `[INPUT: ${r.name.toUpperCase()}]\n${r.text}`).join("\n\n");

        const masterPrompt = `
        [AGENTS REPORTING]: ${validResults.map(r => r.name).join(', ')}
        ${inputs}
        
        [TASK]
        ${taskDescription}
        
        IMPORTANT: Start your response with the exact header "### COUNCIL VERDICT" followed by your analysis.
        `;

        // 4. Send to ALL active agents
        const typePromises = [];
        if (gptTab) typePromises.push(chrome.tabs.sendMessage(gptTab.id, { action: "type_question", question: masterPrompt }));
        if (geminiTab) typePromises.push(chrome.tabs.sendMessage(geminiTab.id, { action: "type_question", question: masterPrompt }));
        if (claudeTab) typePromises.push(chrome.tabs.sendMessage(claudeTab.id, { action: "type_question", question: masterPrompt }));

        await Promise.all(typePromises);

        // 5. Watch for Verdict (Poll)
        const judgeTabId = claudeTab.id;
        let attempts = 0;
        const pollInterval = setInterval(async () => {
            attempts++;
            if (attempts > 120) { clearInterval(pollInterval); return; }

            try {
                const res = await chrome.tabs.sendMessage(judgeTabId, { action: "scrape_answer" });

                if (res && res.answer) {
                    const splitTag = "### COUNCIL VERDICT";
                    if (res.answer.includes(splitTag)) {
                        const finalContent = res.answer.split(splitTag)[1].trim();
                        verdictEl.innerHTML = parseMarkdown(finalContent);
                        verdictEl.classList.remove('loading-text');
                        // Optional: Stop polling once content is stable, but for now safe to keep updating
                    }
                    else if (res.answer.length > 100 && !res.answer.includes("[AGENTS REPORTING]:")) {
                        verdictEl.innerHTML = parseMarkdown(res.answer);
                        verdictEl.classList.remove('loading-text');
                    }
                }
            } catch (e) { }
        }, 2000);

    } catch (err) {
        console.error(err);
        showStatus(err.message || "Judge error occurred.", 'error');
    }
});

// --- RESET BUTTON ---
document.getElementById('resetBtn').addEventListener('click', () => {
    switchView('input');
    document.getElementById('question').value = '';
    showStatus("Ready for next question.", 'normal');
});
