import { createServer } from './app';

const server = createServer({ production: process.argv.includes('--production') });
const port = Number(process.env.PORT ?? 4310);
server.listen(port, '127.0.0.1', () => console.log(`Split Studio API: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
