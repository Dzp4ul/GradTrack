# GradTrack Frontend

React + TypeScript + Vite frontend for GradTrack system.

## Requirements
- Node.js 18+
- npm or yarn

## Local Development Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env.development
```

3. Update `.env.development` with your backend API URL:
```
VITE_API_BASE_URL=http://localhost/GradTrack/backend
```

4. Start development server:
```bash
npm run dev
```

## Build for Production

```bash
npm run build
```

Build output will be in `dist/` directory.

## AWS Amplify Deployment

### Option 1: Amplify Console (Recommended)

1. Push code to GitHub/GitLab/Bitbucket
2. Go to AWS Amplify Console
3. Click "New app" → "Host web app"
4. Connect your repository
5. Select the `frontend` folder as the root directory
6. Add environment variable:
   - Key: `VITE_API_BASE_URL`
   - Value: `https://your-backend-url.elasticbeanstalk.com`
7. Deploy

### Option 2: Amplify CLI

1. Install Amplify CLI:
```bash
npm install -g @aws-amplify/cli
```

2. Initialize Amplify:
```bash
amplify init
```

3. Add hosting:
```bash
amplify add hosting
```

4. Publish:
```bash
amplify publish
```

## Vercel Deployment (Alternative)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel
```

3. Set environment variable in Vercel dashboard:
   - `VITE_API_BASE_URL` = your backend URL

## Netlify Deployment (Alternative)

1. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Deploy:
```bash
netlify deploy --prod
```

3. Set environment variable in Netlify dashboard:
   - `VITE_API_BASE_URL` = your backend URL

## Environment Variables

- `VITE_API_BASE_URL` - Backend API base URL

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
