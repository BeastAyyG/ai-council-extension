// content_script.js - Refactored with Strategy Pattern & Claude Support

(function () {
  'use strict';

  // --- STRATEGY DEFINITIONS ---
  const STRATEGIES = {
    chatgpt: {
      name: 'ChatGPT',
      urlMatches: ['chatgpt.com', 'chat.openai.com'],
      selectors: {
        input: '#prompt-textarea, div[contenteditable="true"]',
        sendBtn: 'button[data-testid="send-button"]',
        response: '[data-message-author-role="assistant"] .markdown', // Explicitly target assistant
        streaming: '.result-streaming' // ChatGPT specific class
      },
      typingMethod: 'hybrid' // Tries generic contentEditable then textarea fallback
    },
    gemini: {
      name: 'Gemini',
      urlMatches: ['gemini.google.com'],
      selectors: {
        input: 'div[contenteditable="true"], .ql-editor, textarea',
        sendBtn: 'button[aria-label*="Send"], button[data-testid="send-button"], .send-button',
        response: '.model-response-text', // Gemini usually separates user/model cleanly
      },
      typingMethod: 'contentEditable'
    },
    claude: {
      name: 'Claude',
      urlMatches: ['claude.ai'],
      selectors: {
        input: 'div[contenteditable="true"]', // Claude uses a contenteditable div
        sendBtn: 'button[aria-label*="Send"]',
        // Claude DOM is tricky. Trying to avoid .font-user-message if it exists.
        // Usually grid items. Let's try to find elements that are NOT user prompts.
        response: '.font-claude-message',
      },
      typingMethod: 'contentEditable',
      useEnterKey: true
    }
  };

  // --- CORE UTILS ---

  function detectStrategy() {
    const host = window.location.hostname;
    for (const key in STRATEGIES) {
      if (STRATEGIES[key].urlMatches.some(match => host.includes(match))) {
        return STRATEGIES[key];
      }
    }
    return null;
  }

  const currentStrategy = detectStrategy();
  if (!currentStrategy) return; // Not a supported site

  console.log(`[AI Council] Active Strategy: ${currentStrategy.name}`);

  function waitForElement(selector, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeout);
    });
  }

  // --- TYPING LOGIC ---

  function simulateTyping(element, text) {
    element.focus();
    element.click();

    // 1. execCommand (Best for Rich Text / ContentEditable)
    if (element.isContentEditable) {
      // Clean up default placeholders
      if (element.innerHTML === '<p><br></p>') element.innerHTML = '';

      const success = document.execCommand('insertText', false, text);
      if (!success) {
        element.innerText = text; // Fallback
      }
    }
    // 2. Value Setter (Best for Textarea/Input)
    else {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      const nativeSetter = descriptor ? descriptor.set : null;
      if (nativeSetter) nativeSetter.call(element, text);
      else element.value = text;
    }

    // 3. Dispatch common events to trigger React State updates
    const events = ['input', 'change', 'keydown', 'keypress', 'keyup'];
    events.forEach(type => {
      element.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  // --- ACTIONS ---

  async function sendMessage() {
    try {
      // Strategy A: Press Enter (if preferred or strictly defined)
      if (currentStrategy.useEnterKey) {
        console.log(`[AI Council] Strategy prefers Enter key for ${currentStrategy.name}`);
        const input = document.querySelector(currentStrategy.selectors.input);
        if (input) {
          input.focus();
          const enterEvent = new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, keyCode: 13, key: 'Enter', code: 'Enter'
          });
          input.dispatchEvent(enterEvent);
          // Verify if it worked? Difficult, but often sufficient.
          // Try to find button as backup if Enter didn't clear input (optional logic, keeping simple for now)
          return true;
        }
      }

      // Strategy B: Click Button
      const btn = await waitForElement(currentStrategy.selectors.sendBtn, 5000);

      if (btn.disabled) {
        console.log('[AI Council] Button disabled. Retrying input events...');
        // Retry unlocking the button by re-dispatching input
        const input = document.querySelector(currentStrategy.selectors.input);
        if (input) {
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (!btn.disabled) {
        btn.click();
        return true;
      } else {
        throw new Error("Send button remains disabled.");
      }

    } catch (e) {
      console.error(`[AI Council] Send Error: ${e.message}`);
      // Fallback: Try Enter key if button failed
      try {
        console.log('[AI Council] Attempting Enter key fallback...');
        const input = document.querySelector(currentStrategy.selectors.input);
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, keyCode: 13, key: 'Enter' }));
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  async function checkAndSendQuestion() {
    try {
      // Use site-specific key to avoid race conditions
      const sentKey = `questionSent_${currentStrategy.name.toLowerCase()}`;
      const data = await chrome.storage.local.get(['user_question', sentKey]);

      if (data.user_question && !data[sentKey]) {
        console.log(`[AI Council] Sending question to ${currentStrategy.name}...`);

        await new Promise(r => setTimeout(r, 2000)); // Wait for app hydration
        const input = await waitForElement(currentStrategy.selectors.input);

        simulateTyping(input, data.user_question);
        await new Promise(r => setTimeout(r, 500)); // Debounce

        await sendMessage();
        await chrome.storage.local.set({ [sentKey]: true });
      }
    } catch (e) {
      console.error("[AI Council] Auto-send failed:", e);
    }
  }

  function scrapeResponse() {
    const responses = document.querySelectorAll(currentStrategy.selectors.response);
    if (!responses.length) return "";
    return responses[responses.length - 1].innerText.trim();
  }

  // --- STATUS TRACKING ---
  let statusTimeout;
  function broadcastStatus(state) {
    chrome.runtime.sendMessage({
      action: 'status_update',
      agent: currentStrategy.name,
      state: state // 'idle', 'working'
    }).catch(() => { }); // Ignore errors if popup is closed
  }

  function startStatusObserver() {
    console.log('[AI Council] Starting Status Observer...');

    // 1. Initial State
    broadcastStatus('idle');

    // 2. Observer
    const observer = new MutationObserver((mutations) => {
      // Simple heuristic: If DOM changes in the response area, it's working
      // For a more robust check, we could look for "streaming" classes
      broadcastStatus('working');

      clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => {
        broadcastStatus('idle');
      }, 2000); // Consider idle if no changes for 2 seconds
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // --- LISTENERS ---

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'scrape_answer') {
      sendResponse({ answer: scrapeResponse() });
    }
    else if (req.action === 'type_question') {
      (async () => {
        try {
          const input = await waitForElement(currentStrategy.selectors.input);
          simulateTyping(input, req.question);
          await new Promise(r => setTimeout(r, 500));
          await sendMessage();
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }
  });

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      checkAndSendQuestion();
      startStatusObserver();
    });
  } else {
    checkAndSendQuestion();
    startStatusObserver();
  }

})();
