export const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
export const BASE_URL=process.env.GAME_TEST_URL||'http://127.0.0.1:4173';
