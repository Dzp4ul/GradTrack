import { createServer } from 'vite';

const server = await createServer({
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});

await server.listen();
console.log('Vite dev server ready at http://127.0.0.1:5173/');

setInterval(() => {}, 2147483647);
