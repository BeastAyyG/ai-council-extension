// dashboard.js

// 1. Init: Load initial data
document.addEventListener('DOMContentLoaded', updateDashboard);

// 2. Listen: Real-time updates
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.council_results || changes.council_verdict) {
            updateDashboard();
        }
    }
});

async function updateDashboard() {
    const data = await chrome.storage.local.get(['council_results', 'council_verdict']);

    // Helper: Simple Markdown Parser
    const parseMarkdown = (text) => {
        if (!text) return "";
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
            .replace(/### (.*?)\n/g, '<h3>$1</h3>') // H3
            .replace(/## (.*?)\n/g, '<h2>$1</h2>') // H2
            .replace(/- (.*?)\n/g, '<li>$1</li>') // List items
            .replace(/\n\n/g, '<br><br>'); // Paragraphs

        // Wrap lists (simple heuristic)
        html = html.replace(/<li>.*?<\/li>/g, match => `<ul>${match}</ul>`).replace(/<\/ul><ul>/g, '');
        return html;
    };

    // Render Results
    if (data.council_results) {
        // council_results is array: [{name, text}, ...]
        const findResult = (name) => data.council_results.find(r => r.name.toLowerCase().includes(name.toLowerCase()));

        const gpt = findResult('chatgpt');
        const gemini = findResult('gemini');
        const claude = findResult('claude');

        if (gpt) document.getElementById('col-chatgpt').innerHTML = parseMarkdown(gpt.text);
        if (gemini) document.getElementById('col-gemini').innerHTML = parseMarkdown(gemini.text);
        if (claude) document.getElementById('col-claude').innerHTML = parseMarkdown(claude.text);
    }

    // Render Verdict
    const verdictEl = document.getElementById('verdict-text');
    if (data.council_verdict) {
        verdictEl.innerHTML = parseMarkdown(data.council_verdict);
        verdictEl.classList.remove('loading-pulse');
    } else {
        verdictEl.innerText = "The Judge is deliberating... this page will update automatically.";
        verdictEl.classList.add('loading-pulse');
    }
}
