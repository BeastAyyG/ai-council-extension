# Deployment Guide: AI Council Extension

## Option 1: Share Locally (The Quick Way)
If you just want to share it with friends/colleagues:
1.  Run the `release_package.sh` script (see below) to create `ai_council_extension.zip`.
2.  Send them the **ZIP file**.
3.  Tell them to:
    - Go to `chrome://extensions`.
    - Enable **Developer Mode** (top right).
    - Drag and drop the ZIP file (or unzip it and click "Load unpacked").

## Option 2: Chrome Web Store (The Public Way)
To make it available to the world:

### 1. Prepare the Package
Run the included script to create a clean zip file:
```bash
./release_package.sh
```
This creates `ai_council_extension_v1.0.zip`.

### 2. Create a Developer Account
- Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/dev/dashboard).
- Sign in with a Google Account.
- Pay the one-time registration fee ($5).

### 3. Upload User Item
- Click **"New Item"**.
- Upload the `ai_council_extension.zip` file.

### 4. Fill in Store Listing
- **Description**: Explain that it helps users query ChatGPT, Gemini, and Claude simultaneously.
- **Privacy Policy**: Since you requested `host_permissions` for AI sites, you might need a simple privacy policy stating you don't collect user data remotely (everything is local).
- **Screenshots**: Take screenshots of the Side Panel and the Results View.

### 5. Publish
- Click **"Submit for Review"**.
- Google usually reviews extensions within 24-48 hours.
