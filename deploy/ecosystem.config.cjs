// pm2 app for the web frontend on the server: the Next.js standalone server, private on 127.0.0.1:3020
// (nginx is the only public entry). Own Node 22 (/opt/node-22); the box's global Node is left alone.
module.exports = {
  apps: [
    {
      name: "autopulse-connect-web",
      cwd: "/opt/autopulse-connect-web/current",
      script: "server.js",
      interpreter: "/opt/node-22/bin/node",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "600M",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: "3020",
        HOSTNAME: "127.0.0.1",
        // Used at request time by src/proxy.ts (session check); the /api rewrites were baked in at build time.
        API_ORIGIN: "http://127.0.0.1:4009",
      },
    },
  ],
};
