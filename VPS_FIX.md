# VPS Directory Fix

## Issue Found
Your project files are in: `/root/design-tool/design-tool` (nested directory)

## Quick Fix Commands (Run in SSH)

```bash
# Navigate to the actual project directory
cd /root/design-tool/design-tool

# Verify files are there
ls -la
# Should see: backend/ frontend/ server.js package.json

# Now install dependencies
cd backend && npm install
cd ../frontend && npm install

# Build frontend
cd ../frontend && npm run build

# Go back to root
cd /root/design-tool/design-tool

# Create .env file
nano .env
# Add your configuration:
# MONGODB_URI=your_mongodb_uri
# PORT=5000
# NODE_ENV=production

# Start server
node server.js

# Or with PM2 (recommended):
pm2 start server.js --name design-tool
pm2 save
pm2 startup
```

## Alternative: Move Files to Correct Location

If you want to fix the nested directory:

```bash
# Move files up one level
cd /root/design-tool
mv design-tool/* .
mv design-tool/.* . 2>/dev/null  # Move hidden files
rmdir design-tool

# Now project is in /root/design-tool
cd /root/design-tool
ls -la
# Should see: backend/ frontend/ server.js
```

