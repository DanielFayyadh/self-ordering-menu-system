const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8080);
const root = __dirname;
const dataDir = process.env.DATA_DIR || root;
const dataFile = path.join(dataDir, "orders-data.json");
const sessionsFile = path.join(dataDir, "table-sessions.json");
const tableStatusFile = path.join(dataDir, "table-status.json");
const menuAvailabilityFile = path.join(dataDir, "menu-availability.json");
let memoryOrders = [];
let memorySessions = {};
let memoryTableStatus = {};
let memoryMenuAvailability = {};

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readOrders() {
  try {
    memoryOrders = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    return memoryOrders;
  } catch {
    return memoryOrders;
  }
}

function writeOrders(orders) {
  memoryOrders = orders;
  try {
    fs.writeFileSync(dataFile, JSON.stringify(orders, null, 2));
  } catch (error) {
    console.warn(`Orders saved in memory only: ${error.message}`);
  }
}

function readSessions() {
  try {
    memorySessions = JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
    return memorySessions;
  } catch {
    return memorySessions;
  }
}

function writeSessions(sessions) {
  memorySessions = sessions;
  try {
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
  } catch (error) {
    console.warn(`Table sessions saved in memory only: ${error.message}`);
  }
}

function getTableSession(table) {
  const sessions = readSessions();
  if (!sessions[table]) {
    sessions[table] = `table-${table}-${Date.now()}`;
    writeSessions(sessions);
  }
  return sessions[table];
}

function readTableStatus() {
  try {
    memoryTableStatus = JSON.parse(fs.readFileSync(tableStatusFile, "utf8"));
    return memoryTableStatus;
  } catch {
    return memoryTableStatus;
  }
}

function writeTableStatus(status) {
  memoryTableStatus = status;
  try {
    fs.writeFileSync(tableStatusFile, JSON.stringify(status, null, 2));
  } catch (error) {
    console.warn(`Table status saved in memory only: ${error.message}`);
  }
}

function getTableState(table) {
  const statuses = readTableStatus();
  return statuses[table] || "ready";
}

function readMenuAvailability() {
  try {
    memoryMenuAvailability = JSON.parse(fs.readFileSync(menuAvailabilityFile, "utf8"));
    return memoryMenuAvailability;
  } catch {
    return memoryMenuAvailability;
  }
}

function writeMenuAvailability(availability) {
  memoryMenuAvailability = availability;
  try {
    fs.writeFileSync(menuAvailabilityFile, JSON.stringify(availability, null, 2));
  } catch (error) {
    console.warn(`Menu availability saved in memory only: ${error.message}`);
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, service: "self-ordering-system" });
    }

    if (url.pathname === "/api/orders" && req.method === "GET") {
      return sendJson(res, 200, readOrders());
    }

    if (url.pathname === "/api/table-status" && req.method === "GET") {
      return sendJson(res, 200, readTableStatus());
    }

    if (url.pathname === "/api/menu-availability" && req.method === "GET") {
      return sendJson(res, 200, readMenuAvailability());
    }

    if (url.pathname === "/api/menu-availability" && req.method === "PATCH") {
      const body = await readBody(req);
      if (!body.id || typeof body.available !== "boolean") {
        return sendJson(res, 400, { error: "Invalid menu availability payload" });
      }
      const availability = readMenuAvailability();
      availability[body.id] = body.available;
      writeMenuAvailability(availability);
      return sendJson(res, 200, availability);
    }

    const tableSessionMatch = url.pathname.match(/^\/api\/tables\/(\d+)\/session$/);
    if (tableSessionMatch && req.method === "GET") {
      const table = Number(tableSessionMatch[1]);
      return sendJson(res, 200, { table, sessionId: getTableSession(table), status: getTableState(table) });
    }

    const tableCloseMatch = url.pathname.match(/^\/api\/tables\/(\d+)\/close$/);
    if (tableCloseMatch && req.method === "POST") {
      const table = Number(tableCloseMatch[1]);
      const orders = readOrders();
      const remaining = orders.filter(order => Number(order.table) !== table);
      writeOrders(remaining);

      const statuses = readTableStatus();
      statuses[table] = "payment_pending";
      writeTableStatus(statuses);

      return sendJson(res, 200, {
        table,
        removed: orders.length - remaining.length,
        sessionId: getTableSession(table),
        status: statuses[table]
      });
    }

    const tableReadyMatch = url.pathname.match(/^\/api\/tables\/(\d+)\/ready$/);
    if (tableReadyMatch && req.method === "POST") {
      const table = Number(tableReadyMatch[1]);
      const sessions = readSessions();
      sessions[table] = `table-${table}-${Date.now()}`;
      writeSessions(sessions);

      const statuses = readTableStatus();
      statuses[table] = "ready";
      writeTableStatus(statuses);

      return sendJson(res, 200, { table, sessionId: sessions[table], status: "ready" });
    }

    if (url.pathname === "/api/orders" && req.method === "POST") {
      const order = await readBody(req);
      if (!Number.isInteger(Number(order.table)) || !Array.isArray(order.items) || order.items.length === 0) {
        return sendJson(res, 400, { error: "Invalid order payload" });
      }
      const orders = readOrders();
      const saved = {
        ...order,
        id: order.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sessionId: getTableSession(Number(order.table)),
        status: order.status || "Preparing",
        createdAt: order.createdAt || Date.now()
      };
      orders.push(saved);
      writeOrders(orders);
      return sendJson(res, 201, saved);
    }

    const statusMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (statusMatch && req.method === "PATCH") {
      const body = await readBody(req);
      const orders = readOrders();
      const order = orders.find(item => item.id === decodeURIComponent(statusMatch[1]));
      if (!order) return sendJson(res, 404, { error: "Order not found" });
      order.status = body.status || order.status;
      writeOrders(orders);
      return sendJson(res, 200, order);
    }

    if (url.pathname === "/api/orders/completed" && req.method === "DELETE") {
      const orders = readOrders();
      const remaining = orders.filter(order => order.status !== "Completed");
      writeOrders(remaining);
      return sendJson(res, 200, { removed: orders.length - remaining.length });
    }

    const requestPath = url.pathname === "/" ? "/self-ordering-system.html" : decodeURIComponent(url.pathname);
    const filePath = path.normalize(path.join(root, requestPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(data);
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Self-ordering server running at http://0.0.0.0:${port}/`);
});
