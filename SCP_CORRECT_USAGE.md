# Correct SCP Usage - Upload Files to VPS

## ⚠️ Important: Upload FROM Windows TO VPS

You're currently **on the VPS** (SSH), but you need to upload files **FROM your Windows machine TO the VPS**.

## The Problem

You tried: `scp *.json *.js user@192.168.1.100:~/design-tool/`

This won't work because:
1. You're on the VPS, not your Windows machine
2. The files are on your Windows machine (`d:\Local App`)
3. You need to run `scp` FROM Windows TO the VPS

## Correct Solution

### Step 1: Open PowerShell on Your Windows Machine

**NOT in SSH!** Open a **new PowerShell window** on your Windows computer.

### Step 2: Upload Files to VPS

```powershell
# Navigate to your project
cd "d:\Local App"

# Upload backend folder
scp -r backend root@72.61.147.178:/root/design-tool/

# Upload frontend folder
scp -r frontend root@72.61.147.178:/root/design-tool/

# Upload root files
scp server.js package.json root@72.61.147.178:/root/design-tool/
```

### Step 3: Verify in SSH

**Go back to your SSH terminal** and check:

```bash
cd /root/design-tool
ls -la
# Should see: backend/ frontend/ server.js package.json

# Check nested directory
cd design-tool
ls -la
# Should see: backend/ frontend/ server.js
```

## Alternative: Use Git (Easier!)

If your project is on GitHub:

### On VPS (SSH):
```bash
cd /root
rm -rf design-tool  # Remove incomplete upload
git clone https://github.com/mkb7862024/design-tool.git
cd design-tool
ls -la
# Should see: backend/ frontend/ server.js
```

## SCP Command Syntax

### From Windows TO VPS:
```powershell
# Format: scp -r [local_folder] [user]@[server]:[remote_path]
scp -r backend root@72.61.147.178:/root/design-tool/
```

### From VPS TO Windows (if needed):
```powershell
# Format: scp [user]@[server]:[remote_path] [local_path]
scp root@72.61.147.178:/root/design-tool/server.js "d:\Local App\"
```

## Complete Upload Workflow

### On Windows (PowerShell):
```powershell
cd "d:\Local App"

# Upload everything
scp -r backend root@72.61.147.178:/root/design-tool/
scp -r frontend root@72.61.147.178:/root/design-tool/
scp server.js package.json .env root@72.61.147.178:/root/design-tool/
```

### On VPS (SSH):
```bash
cd /root/design-tool
ls -la
# Verify files are there

# If files are in nested directory:
cd design-tool
ls -la

# Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../frontend && npm run build
```

## Common Mistakes

❌ **Wrong:** Running `scp` from VPS to copy files that aren't there
✅ **Correct:** Running `scp` from Windows to upload files to VPS

❌ **Wrong:** Using wildcards `*.json` in scp (doesn't work)
✅ **Correct:** Specify exact files or use `-r` for folders

❌ **Wrong:** Trying to copy from VPS when files are on Windows
✅ **Correct:** Copy FROM Windows TO VPS

## Quick Reference

| Action | Where | Command |
|--------|-------|---------|
| Upload folder | Windows PowerShell | `scp -r folder root@server:/path/` |
| Upload file | Windows PowerShell | `scp file root@server:/path/` |
| Check files | VPS SSH | `ls -la` |
| Install deps | VPS SSH | `npm install` |

---

**Remember: Upload FROM Windows TO VPS, not the other way around!**

