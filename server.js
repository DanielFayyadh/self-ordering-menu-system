const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8080);
const root = __dirname;
const dataDir = process.env.DATA_DIR || root;
const dataFile = path.join(dataDir, "orders-data.json");
const sessionsFile = path.join(dataDir, "table-sessions.json");
const menuAvailabilityFile = path.join(dataDir, "menu-availability.json");
const cashierMessagesFile = path.join(dataDir, "cashier-messages.json");
let memoryOrders = [];
let memorySessions = {};
let memoryMenuAvailability = {};
let memoryCashierMessages = [];

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
    sessions[table] = { id: `table-${table}-${Date.now()}`, issuedAt: Date.now() };
    writeSessions(sessions);
  }
  if (typeof sessions[table] === "string") {
    sessions[table] = { id: sessions[table], issuedAt: Date.now() };
    writeSessions(sessions);
  }
  return sessions[table];
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

function readCashierMessages() {
  try {
    memoryCashierMessages = JSON.parse(fs.readFileSync(cashierMessagesFile, "utf8"));
    return memoryCashierMessages;
  } catch {
    return memoryCashierMessages;
  }
}

function writeCashierMessages(messages) {
  memoryCashierMessages = messages;
  try {
    fs.writeFileSync(cashierMessagesFile, JSON.stringify(messages, null, 2));
  } catch (error) {
    console.warn(`Cashier messages saved in memory only: ${error.message}`);
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
      const orders = readOrders();
      const sessions = readSessions();
      const tables = {};
      for (let table = 1; table <= 21; table += 1) {
        const tableOrders = orders.filter(order => Number(order.table) === table);
        tables[table] = {
          table,
          sessionId: sessions[table]?.id || sessions[table] || null,
          issuedAt: sessions[table]?.issuedAt || null,
          status: tableOrders.length ? "open" : "closed",
          orderCount: tableOrders.length,
          total: tableOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)
        };
      }
      return sendJson(res, 200, tables);
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

    if (url.pathname === "/api/cashier-messages" && req.method === "GET") {
      return sendJson(res, 200, readCashierMessages());
    }

    if (url.pathname === "/api/cashier-messages" && req.method === "POST") {
      const body = await readBody(req);
      if (!Number.isInteger(Number(body.table)) || !body.request) {
        return sendJson(res, 400, { error: "Invalid cashier message payload" });
      }
      const messages = readCashierMessages();
      const saved = {
        id: body.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        table: Number(body.table),
        sessionId: body.sessionId || getTableSession(Number(body.table)).id,
        request: String(body.request).slice(0, 160),
        note: String(body.note || "").slice(0, 500),
        response: "",
        status: "Open",
        createdAt: body.createdAt || Date.now(),
        respondedAt: null
      };
      messages.push(saved);
      writeCashierMessages(messages);
      return sendJson(res, 201, saved);
    }

    const cashierReplyMatch = url.pathname.match(/^\/api\/cashier-messages\/([^/]+)\/reply$/);
    if (cashierReplyMatch && req.method === "PATCH") {
      const body = await readBody(req);
      const messages = readCashierMessages();
      const message = messages.find(item => item.id === decodeURIComponent(cashierReplyMatch[1]));
      if (!message) return sendJson(res, 404, { error: "Message not found" });
      message.response = String(body.response || "").slice(0, 500);
      message.status = message.response ? "Replied" : "Open";
      message.respondedAt = message.response ? Date.now() : null;
      writeCashierMessages(messages);
      return sendJson(res, 200, message);
    }

    const tableSessionMatch = url.pathname.match(/^\/api\/tables\/(\d+)\/session$/);
    if (tableSessionMatch && req.method === "GET") {
      const table = Number(tableSessionMatch[1]);
      const session = getTableSession(table);
      return sendJson(res, 200, { table, sessionId: session.id, issuedAt: session.issuedAt });
    }

    const tableCloseMatch = url.pathname.match(/^\/api\/tables\/(\d+)\/close$/);
    if (tableCloseMatch && req.method === "POST") {
      const table = Number(tableCloseMatch[1]);
      const orders = readOrders();
      const remaining = orders.filter(order => Number(order.table) !== table);
      writeOrders(remaining);
      const messages = readCashierMessages();
      writeCashierMessages(messages.filter(message => Number(message.table) !== table));

      const sessions = readSessions();
      sessions[table] = { id: `table-${table}-${Date.now()}`, issuedAt: Date.now() };
      writeSessions(sessions);

      return sendJson(res, 200, {
        table,
        removed: orders.length - remaining.length,
        sessionId: sessions[table].id,
        issuedAt: sessions[table].issuedAt
      });
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
        sessionId: getTableSession(Number(order.table)).id,
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

    const servedMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/items\/(\d+)\/served$/);
    if (servedMatch && req.method === "PATCH") {
      const body = await readBody(req);
      const orders = readOrders();
      const order = orders.find(item => item.id === decodeURIComponent(servedMatch[1]));
      if (!order) return sendJson(res, 404, { error: "Order not found" });

      const itemIndex = Number(servedMatch[2]);
      if (!order.items[itemIndex]) return sendJson(res, 404, { error: "Order item not found" });

      order.items[itemIndex].served = Boolean(body.served);
      order.status = order.items.every(item => item.served) ? "Completed" : "Preparing";
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
