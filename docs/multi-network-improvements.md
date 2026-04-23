# Multi-Network Support Improvements

## Problem

The original bitcast could only discover and cast to DLNA devices on a single network interface. This meant:

- A machine connected to both Ethernet and WiFi would only find TVs on one network
- TVs on a different subnet couldn't reach the streaming server
- Devices powered on after bitcast started were never discovered
- Only standard DLNA MediaRenderer v1 devices were found

## Changes

### 1. Multi-Interface SSDP Discovery (`dlna.js`)

**Before:** A single `node-ssdp` client bound to `0.0.0.0`, which sends multicast on whichever interface the OS chooses.

**After:** One SSDP client per IPv4 network interface, discovered via `os.networkInterfaces()`. Each client sends M-SEARCH independently, so devices on every connected network are found.

```js
// Enumerates all non-internal IPv4 interfaces
function getNetworkInterfaces () {
  var interfaces = os.networkInterfaces()
  // returns [{name: 'eth0', address: '192.168.1.100'}, {name: 'wlan0', address: '10.0.0.50'}]
}
```

Falls back to a single default client if no interfaces are found or all per-interface clients fail to initialize.

### 2. Periodic Re-Discovery (`dlna.js`)

**Before:** `that.update()` called once at startup.

**After:** `that.startDiscovery()` runs `update()` on a configurable interval (default: 10 seconds). Devices that come online after bitcast starts are discovered automatically.

```js
// Configure discovery interval
var dlnacasts = require('./dlna')({ discoveryInterval: 15000 })

// Stop/restart discovery
dlnacasts.stopDiscovery()
dlnacasts.startDiscovery()
```

### 3. Broader Device Search (`dlna.js`)

**Before:** Only searched for `urn:schemas-upnp-org:device:MediaRenderer:1`.

**After:** Searches for multiple UPnP service types:
- `urn:schemas-upnp-org:device:MediaRenderer:1` (DLNA 1.x TVs)
- `urn:schemas-upnp-org:device:MediaRenderer:2` (DLNA 2.x devices)
- `urn:schemas-upnp-org:service:AVTransport:1` (devices that expose AVTransport directly)

Customizable via options:
```js
var dlnacasts = require('./dlna')({
  searchTargets: [
    'urn:schemas-upnp-org:device:MediaRenderer:1',
    'urn:schemas-upnp-org:device:MediaRenderer:2',
    'ssdp:all' // discover everything
  ]
})
```

### 4. Server Binds to All Interfaces (`lib/server.js`)

**Before:** Bound to a single IP from `network-address()`, making the stream unreachable from other subnets.

**After:** Binds to `0.0.0.0` (all interfaces). The stream is reachable from any network the machine is connected to. `HOST` env var still overrides if needed.

### 5. Per-Player URL Rewriting (`cast.js`, `lib/server.js`)

**Before:** The same stream URL (with a single-interface IP) was sent to every player.

**After:** `closestAddress(playerHost)` picks the local IP that shares the longest subnet prefix with the player's IP. The stream URL sent to each TV uses an address on the same subnet.

```
Machine: eth0=192.168.1.100, wlan0=10.0.0.50
TV at 192.168.1.200 → gets http://192.168.1.100:PORT/video
TV at 10.0.0.80     → gets http://10.0.0.50:PORT/video
```

### 6. Proper Cleanup (`dlna.js`, `cast.js`)

**Before:** `that.destroy()` was a no-op. SSDP clients and timers were leaked.

**After:** `destroy()` stops periodic discovery, clears timers, and stops all SSDP clients. `cast.js` calls `dlnacasts.destroy()` on exit.

### 7. Improved Deduplication (`dlna.js`)

**Before:** Devices were deduped by `friendlyName` alone. Two different TVs with the same name (e.g. "Living Room TV") on different networks would collide.

**After:** Deduplication key is `name@host`, so identically-named devices on different subnets are tracked separately.

## Configuration

All improvements are backward-compatible. The module works identically to before on single-network setups. New options are opt-in:

| Option | Default | Description |
|--------|---------|-------------|
| `discoveryInterval` | `10000` (10s) | Milliseconds between SSDP searches |
| `searchTargets` | MediaRenderer v1/v2 + AVTransport | Array of UPnP search target URNs |
| `HOST` env var | `0.0.0.0` | Override server bind address |
| `PORT` env var | random | Override server port |

## Limitations

- `closestAddress()` uses simple octet prefix matching, not actual subnet mask calculation. This works for typical /24 home networks but may pick wrong on unusual subnets.
- Multicast SSDP may be blocked by router/AP isolation settings. Devices on isolated guest networks won't be discoverable regardless.
- The streaming server serves on a single port — firewalls must allow inbound connections from all subnets where TVs reside.
