# Feedback & Bug Report Setup Guide

## Overview
You now have two feedback forms integrated into Pointa's Settings menu:
1. **Send Feedback** - Simple feedback form
2. **Report a Bug** - Detailed bug report with automatic context

## Setting Up Tally.so Forms

### Step 1: Create a Tally.so Account
1. Go to https://tally.so
2. Sign up for a free account
3. Confirm your email

### Step 2: Create the Feedback Form

#### Create the Form:
1. Click **"Create form"** in your Tally dashboard
2. Choose **"Start from scratch"**
3. Name it: "Pointa - User Feedback"

#### Add Questions:
1. **Question 1 - Text Area (Required)**
   - Click **"Add block"** → **"Text"** → **"Long text"**
   - Label: "What's on your mind?"
   - Placeholder: "Share your feedback, suggestions, or ideas..."
   - Toggle **"Required"** ON

2. **Question 2 - File Upload (Optional)**
   - Click **"Add block"** → **"File upload"**
   - Label: "Add a screenshot (optional)"
   - Accept: Images only
   - Max files: 1
   - Toggle **"Required"** OFF

3. **Question 3 - Email (Optional)**
   - Click **"Add block"** → **"Email"**
   - Label: "Email (optional - for follow-up)"
   - Toggle **"Required"** OFF

#### Configure Settings:
1. Click **"Settings"** (gear icon)
2. Under **"After submit"**:
   - Select "Show custom message"
   - Message: "Thanks for your feedback! 🙏 We read every response."
3. Under **"Notifications"**:
   - Enable email notifications to get notified of each submission

#### Publish & Get Form ID:
1. Click **"Publish"** in the top-right
2. Click **"Share"** button
3. Look for the form URL (e.g., `https://tally.so/r/wMeDqR`)
4. Copy the part after `/r/` (e.g., `wMeDqR`) - this is your **Feedback Form ID**

---

### Step 3: Create the Bug Report Form

#### Create the Form:
1. Click **"Create form"** in your Tally dashboard
2. Choose **"Start from scratch"**
3. Name it: "Pointa - Bug Report"

#### Add Questions:
1. **Question 1 - Text Area (Required)**
   - Click **"Add block"** → **"Text"** → **"Long text"**
   - Label: "Describe the bug"
   - Placeholder: "What happened? What did you expect to happen?"
   - Toggle **"Required"** ON

2. **Question 2 - File Upload (Optional)**
   - Click **"Add block"** → **"File upload"**
   - Label: "Screenshot or video (optional)"
   - Accept: Images and videos
   - Max files: 1
   - Toggle **"Required"** OFF

3. **Question 3 - Dropdown (Optional)**
   - Click **"Add block"** → **"Multiple choice"** → **"Dropdown"**
   - Label: "How severe is this?"
   - Options:
     - "Blocker - Can't use the extension"
     - "Major - Feature doesn't work"
     - "Minor - Small issue or annoyance"
   - Toggle **"Required"** OFF

4. **Question 4 - Email (Optional)**
   - Click **"Add block"** → **"Email"**
   - Label: "Email (optional - for follow-up)"
   - Toggle **"Required"** OFF

#### Add Hidden Fields (for automatic context):
For each of these, click **"Add block"** → **"Text"** → **"Short text"**, then:
- Click the **"..."** menu on the question → **"Settings"**
- Toggle **"Hidden"** ON
- Set the **"URL parameter name"** exactly as shown below:

Hidden fields to add (only 4 essential fields):
1. **Extension Version**
   - URL parameter name: `extension_version`
   
2. **Browser**
   - URL parameter name: `browser`
   
3. **Operating System**
   - URL parameter name: `os`
   
4. **Page Type**
   - URL parameter name: `page_type`

#### Configure Settings:
1. Click **"Settings"** (gear icon)
2. Under **"After submit"**:
   - Select "Show custom message"
   - Message: "Bug report submitted! 🐛 We'll investigate this ASAP."
3. Under **"Notifications"**:
   - Enable email notifications

#### Publish & Get Form ID:
1. Click **"Publish"** in the top-right
2. Click **"Share"** button
3. Look for the form URL (e.g., `https://tally.so/r/nP9xYz`)
4. Copy the part after `/r/` (e.g., `nP9xYz`) - this is your **Bug Report Form ID**

---

### Step 4: Update the Extension Code

Now that you have both form IDs, update the code:

1. Open `/extension/content/modules/sidebar-ui.js`

2. Find the `showFeedbackModal()` function (around line 5272)
3. Replace `YOUR_FEEDBACK_FORM_ID` with your actual form ID:
   ```javascript
   src="https://tally.so/r/wMeDqR?transparentBackground=1"
   ```

4. Find the `showBugReportModal()` function (around line 5319)
5. Replace `YOUR_BUG_FORM_ID` with your actual form ID:
   ```javascript
   src="https://tally.so/r/nP9xYz?${params.toString()}"
   ```

6. Save the file

---

### Step 5: Test the Forms

1. Load/reload the extension in Chrome:
   - Go to `chrome://extensions/`
   - Click "Reload" on Pointa
   
2. Open the extension sidebar on any page
3. Click Settings (gear icon)
4. Click **"Send Feedback"** - the feedback form should load
5. Click **"Report a Bug"** - the bug report form should load with all context pre-filled

---

## Viewing Submissions

### In Tally Dashboard:
1. Go to your Tally.so dashboard
2. Click on the form name
3. Click **"Results"** tab
4. View all submissions

### Bug Report Context:
For bug reports, you'll see the hidden fields populated automatically:
- **Extension version** (e.g., "1.0.3") - Know which version has the bug
- **Browser** (e.g., "Chrome 120") - Browser-specific issues
- **OS** (e.g., "macOS") - OS-specific bugs
- **Page type** (e.g., "localhost") - Context where the bug occurred

This essential context helps you debug issues without asking users for technical details!

---

## Tips

1. **Email Notifications**: Make sure to enable email notifications in Tally so you get notified immediately when someone submits feedback

2. **Export Data**: You can export all responses to CSV from the Results tab

3. **Integrations**: Tally integrates with Slack, Notion, and other tools if you want automated workflows

4. **Privacy**: The forms collect minimal data - no tracking, no analytics, just what users explicitly submit

5. **Free Plan**: Tally's free plan includes unlimited forms and unlimited responses - perfect for indie projects!

---

## Troubleshooting

**Form doesn't load:**
- Check that you replaced `YOUR_FEEDBACK_FORM_ID` and `YOUR_BUG_FORM_ID` with actual IDs
- Make sure the form is published (not in draft mode)

**Hidden fields not populating:**
- Verify the URL parameter names match exactly (case-sensitive)
- Check that you toggled "Hidden" ON for each field

**Modal doesn't close:**
- Press ESC key
- Click outside the modal
- Click the X button

---

## Analytics Tracking (Optional)

The extension automatically tracks:
- `feedbackOpened` - How many times users open the feedback form
- `bugReportOpened` - How many times users open the bug report form

You can view these stats in Chrome DevTools:
```javascript
chrome.storage.local.get(['feedbackOpened', 'bugReportOpened'], console.log)
```

This helps you understand engagement without any external analytics!

