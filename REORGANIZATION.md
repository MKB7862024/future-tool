# Project Reorganization

The project has been reorganized into separate `backend/` and `frontend/` folders.

## New Structure

```
backend/
  ├── package.json          # Backend dependencies
  ├── server.js              # Main backend server (moved from root)
  ├── src/                   # Backend source code (moved from src/backend/)
  │   ├── routes/
  │   ├── middleware/
  │   ├── services/
  │   ├── utils/
  │   └── config/
  ├── data/                  # Data files (moved from root)
  ├── uploads/               # Upload directories (moved from root)
  ├── backend.html          # Backend panel HTML (moved from root)
  ├── scripts/              # Utility scripts (moved from root)
  └── node_modules/         # Backend dependencies (after npm install)

frontend/
  ├── package.json          # Frontend dependencies
  ├── vite.config.js        # Vite configuration (moved from root)
  ├── index.html            # Frontend HTML (moved from root)
  ├── src/                  # Frontend source code (moved from root, excluding backend/)
  │   ├── components/
  │   ├── utils/
  │   └── ...
  ├── public/               # Public assets (moved from root)
  ├── build/                # Production build output (after npm run build)
  └── node_modules/         # Frontend dependencies (after npm install)
```

## Changes Made

1. **Backend folder (`backend/`)**:
   - Created `backend/package.json` with backend-only dependencies
   - Updated `server.js` import paths from `./src/backend/` to `./src/`
   - Updated production build path from `dist/` to `../frontend/build/`
   - Moved `src/backend/` → `backend/src/`
   - Moved `data/`, `uploads/`, `backend.html`, `scripts/` to `backend/`

2. **Frontend folder (`frontend/`)**:
   - Created `frontend/package.json` with frontend-only dependencies
   - Updated `vite.config.js` to output to `build/` instead of `dist/`
   - Moved frontend `src/` files (excluding `backend/`) to `frontend/src/`
   - Moved `index.html`, `vite.config.js`, `public/` to `frontend/`

## Next Steps

1. **Install dependencies**:
   ```bash
   cd backend
   npm install
   
   cd ../frontend
   npm install
   ```

2. **Update environment variables**:
   - Backend `.env` should remain in `backend/` folder
   - Frontend `.env` should be in `frontend/` folder

3. **Update scripts**:
   - Backend: `cd backend && npm start`
   - Frontend: `cd frontend && npm run dev`

4. **Update any hardcoded paths** in your code that reference the old structure.

## Running the Application

### Development:
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Production:
```bash
# Build frontend
cd frontend
npm run build

# Start backend (serves frontend build)
cd backend
npm start
```

## Notes

- The root `package.json` can be kept for convenience scripts or removed
- All import paths in `server.js` have been updated to use `./src/` instead of `./src/backend/`
- The production build path now points to `../frontend/build/` instead of `./dist/`
- Frontend build output is now `build/` instead of `dist/` to match common React conventions

