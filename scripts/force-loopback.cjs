'use strict';

// Remotion Studio 4 binds to 0.0.0.0 by design and has no hostname flag.
// Constrain every HTTP listener in this Studio process to IPv4 loopback.
const http = require('node:http');
const os = require('node:os');

const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function forceLoopback(...args) {
  if (args[0] && typeof args[0] === 'object') {
    args[0] = {...args[0], host: '127.0.0.1'};
  }
  return originalListen.apply(this, args);
};

// Prevent Remotion from advertising an unreachable LAN URL.
os.networkInterfaces = () => ({
  lo: [
    {
      address: '127.0.0.1',
      netmask: '255.0.0.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: true,
      cidr: '127.0.0.1/8',
    },
  ],
});
