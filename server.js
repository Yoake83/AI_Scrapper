import { createApp } from './app.js';
const port = Number(process.env.PORT) || 3000;
const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`Cherry Picked listening on port ${port}. Groq key ${process.env.GROQ_API_KEY ? 'configured' : 'missing'}.`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
