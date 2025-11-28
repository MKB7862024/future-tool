# VPS Upload Troubleshooting

## Issue: "No such file or directory" for backend folder

This means the files weren't uploaded correctly or are in a different location.

## Quick Fix Commands (Run in SSH)

### Step 1: Check what's actually there
```bash
# Check current location
pwd

# List all files
ls -la

# Check if files are in parent directory
cd /root
ls -la

# Search for server.js
find /root -name "server.js" -type f 2>/dev/null

# Search for backend folder
find /root -type d -name "backend" 2>/dev/null
```

### Step 2: If files are missing, upload them properly

**From your LOCAL Windows machine (new PowerShell window):**

```powershell
cd "d:\Local App"

# Upload backend folder
scp -r backend root@72.61.147.178:/root/design-tool/

# Upload frontend folder
scp -r frontend root@72.61.147.178:/root/design-tool/

# Upload root files
scp server.js package.json root@72.61.147.178:/root/design-tool/
```

### Step 3: Verify upload in SSH
```bash
cd /root/design-tool
ls -la
# Should see: backend/ frontend/ server.js package.json

# Check backend exists
ls -la backend/
# Should see: package.json src/ etc.
```

## Alternative: Use Git Clone (Easier)

If you've pushed to GitHub:

```bash
# Remove current directory if needed
cd /root
rm -rf design-tool

# Clone from GitHub
git clone https://github.com/mkb7862024/design-tool.git
cd design-tool

# Verify structure
ls -la
# Should see: backend/ frontend/ server.js

# Now install
cd backend && npm install
cd ../frontend && npm install
```

## Check Current Structure

Run this in SSH to see what you have:

```bash
cd /root/design-tool
echo "=== Current Directory ==="
pwd
echo ""
echo "=== Files and Folders ==="
ls -la
echo ""
echo "=== Searching for backend ==="
find . -type d -name "backend" 2>/dev/null
find . -type d -name "frontend" 2>/dev/null
```

