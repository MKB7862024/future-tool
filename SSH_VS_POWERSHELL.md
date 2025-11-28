# SSH vs PowerShell - Important Difference!

## ⚠️ CRITICAL: Commands are for SSH (Linux Server), NOT PowerShell (Windows)

You're trying to run Linux commands in Windows PowerShell. This won't work!

## Where to Run Commands

### ✅ SSH Terminal (Linux Server)
- Where you see: `root@srv1121542:~/design-tool#`
- This is your **Linux server** (VPS)
- Run **Linux commands** here: `cd`, `ls -la`, `npm install`, etc.

### ❌ PowerShell (Windows Local Machine)
- Where you see: `PS D:\Local App>`
- This is your **Windows computer**
- Run **Windows commands** here: `cd`, `dir`, `npm install`, etc.

---

## Correct Workflow

### Step 1: In SSH (Linux Server)
```bash
# You should see: root@srv1121542:~/design-tool#
cd /root/design-tool/design-tool
ls -la
# Should see: backend/ frontend/ server.js

cd backend
npm install

cd ../frontend
npm install

cd ../frontend
npm run build
```

### Step 2: If you need to upload files from Windows
**Open a NEW PowerShell window** (not SSH) and run:
```powershell
cd "d:\Local App"
scp -r backend root@72.61.147.178:/root/design-tool/
scp -r frontend root@72.61.147.178:/root/design-tool/
```

---

## How to Identify Where You Are

### SSH Terminal (Linux):
- Prompt: `root@srv1121542:~/design-tool#`
- Commands: `ls -la`, `cd /root`, `npm install`
- Paths: `/root/design-tool/backend`

### PowerShell (Windows):
- Prompt: `PS D:\Local App>`
- Commands: `dir`, `cd "d:\Local App"`, `npm install`
- Paths: `D:\Local App\backend`

---

## Quick Reference

| Task | Where | Command |
|------|-------|---------|
| Check files on server | SSH | `ls -la` |
| Install npm packages | SSH | `npm install` |
| Upload files to server | PowerShell | `scp -r folder root@server:/path/` |
| Navigate on server | SSH | `cd /root/design-tool` |
| Navigate on Windows | PowerShell | `cd "d:\Local App"` |

---

## Your Current Situation

You're in **PowerShell on Windows** (`PS D:\Local App>`).

**To work on the server:**
1. Go back to your **SSH terminal** (where you see `root@srv1121542`)
2. Run the Linux commands there

**To upload files:**
1. Stay in **PowerShell** (Windows)
2. Use `scp` commands to upload

---

## Example: Complete Setup

### In SSH (Linux Server):
```bash
root@srv1121542:~/design-tool# cd /root/design-tool/design-tool
root@srv1121542:~/design-tool/design-tool# ls -la
root@srv1121542:~/design-tool/design-tool# cd backend
root@srv1121542:~/design-tool/design-tool/backend# npm install
root@srv1121542:~/design-tool/design-tool/backend# cd ../frontend
root@srv1121542:~/design-tool/design-tool/frontend# npm install
root@srv1121542:~/design-tool/design-tool/frontend# npm run build
```

### In PowerShell (Windows - only if uploading):
```powershell
PS D:\Local App> scp -r backend root@72.61.147.178:/root/design-tool/
```

---

**Remember: SSH = Linux commands, PowerShell = Windows commands!**

