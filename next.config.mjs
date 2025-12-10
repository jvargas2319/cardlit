import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file and ALWAYS override system env vars (for local development)
// This ensures .env file values take precedence over system environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  // Always use .env values in development
  for (const key in envConfig) {
    process.env[key] = envConfig[key];
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle epub2's zipfile dependency and pdf-to-img ESM bundling issue
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('zipfile');
      config.externals.push('pdf-to-img');
    }
    return config;
  },
};

export default nextConfig;
