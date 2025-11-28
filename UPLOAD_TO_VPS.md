# Upload Project to VPS - Commands Guide

## Method 1: Using SCP (Secure Copy) - Recommended

**Run these commands from your LOCAL Windows machine (not in SSH):**

### Upload entire project:
```powershell
cd "d:\Local App"
scp -r . root@72.61.147.178:/root/design-tool
```

### Upload specific folders only:
```powershell
# Upload backend
scp -r backend root@72.61.147.178:/root/design-tool/

# Upload frontend
scp -r frontend root@72.61.147.178:/root/design-tool/

# Upload server.js and other root files
scp server.js package.json .env root@72.61.147.178:/root/design-tool/
```

### Exclude node_modules (faster):
```powershell
# Using rsync (if available) or manually exclude
scp -r --exclude 'node_modules' --exclude '.git' . root@72.61.147.178:/root/design-tool
```

---

## Method 2: Using Git Clone (Best if project is on GitHub)

**On your VPS (in SSH), run:**

```bash
# Navigate to where you want the project
cd /root

# Clone from GitHub
git clone https://github.com/mkb7862024/design-tool.git

# Or if using SSH key:
git clone git@github.com:mkb7862024/design-tool.git

# Navigate into project
cd design-tool

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Build frontend
cd ../frontend && npm run build
```

---

## Method 3: Using rsync (Most Efficient)

**From your LOCAL Windows machine:**

```powershell
# Install rsync for Windows first, or use WSL
# Then:
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude 'build' "d:\Local App\" root@72.61.147.178:/root/design-tool/
```

---

## Method 4: Create Archive and Upload

**From your LOCAL Windows machine:**

```powershell
# Create zip (excluding node_modules)
cd "d:\Local App"
Compress-Archive -Path backend,frontend,server.js,package.json,.env -DestinationPath project.zip -Force

# Upload zip
scp project.zip root@72.61.147.178:/root/

# Then in SSH, extract:
# cd /root
# unzip project.zip -d design-tool
# cd design-tool
```

---

## Complete Setup After Upload

**Once files are uploaded, in SSH run:**

```bash
# Navigate to project
cd /root/design-tool

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Build frontend
npm run build

# Go back to root
cd /root/design-tool

# Set up environment variables
nano .env
# Add your MongoDB URI, port, etc.

# Start server (or use PM2)
node server.js

# Or with PM2 (recommended for production):
pm2 start server.js --name design-tool
pm2 save
pm2 startup
```

---

## Quick Commands Reference

### From Local Machine (PowerShell):
```powershell
# Upload everything
scp -r "d:\Local App\*" root@72.61.147.178:/root/design-tool/

# Upload specific folder
scp -r "d:\Local App\backend" root@72.61.147.178:/root/design-tool/
scp -r "d:\Local App\frontend" root@72.61.147.178:/root/design-tool/
```

### In SSH (VPS):
```bash
# Create directory
mkdir -p /root/design-tool

# Check uploaded files
ls -la /root/design-tool

# Install dependencies
cd /root/design-tool/backend && npm install
cd /root/design-tool/frontend && npm install

# Build
cd /root/design-tool/frontend && npm run build
```

---

## Recommended: Use Git (Easiest)

1. **Push to GitHub from local machine**
2. **Clone on VPS:**
   ```bash
   cd /root
   git clone https://github.com/mkb7862024/design-tool.git
   cd design-tool
   ```
3. **Install and build:**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install && npm run build
   ```

This way you can easily update with `git pull` later!

