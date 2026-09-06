import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const requireProductionUrl = (name: string, value: string | undefined, protocols: string[]): void => {
  const configured = String(value || '').trim();
  if (!configured) throw new Error(`${name} is required for a production build.`);
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
  if (!protocols.includes(parsed.protocol)) throw new Error(`${name} must use ${protocols.join(' or ')}.`);
  if (['localhost', '127.0.0.1'].includes(parsed.hostname.toLowerCase()) || /(?:example|change-me|your-)/i.test(configured)) {
    throw new Error(`${name} must reference the real production service.`);
  }
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnvironment = loadEnv(mode, '.', '');
  if (mode === 'production') {
    requireProductionUrl('VITE_API_BASE_URL', process.env.VITE_API_BASE_URL || fileEnvironment.VITE_API_BASE_URL, ['https:']);
    requireProductionUrl('VITE_REALTIME_URL', process.env.VITE_REALTIME_URL || fileEnvironment.VITE_REALTIME_URL, ['https:', 'wss:']);
  }

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
