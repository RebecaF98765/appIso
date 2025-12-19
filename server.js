import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

// LowDB
const dbFile = join(__dirname, "db.json");
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { reservations: [] });

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

async function initDB() {
  await db.read();
  db.data ||= { reservations: [] };
  await db.write();
}

function normalize(str) {
  return String(str ?? "").trim();
}

function isValidDateYYYYMMDD(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function isValidTimeHHMM(timeStr) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr);
}

function hasConflict(resList, { room, date, time }, excludeId = null) {
  const rRoom = room.toLowerCase();
  return resList.some(r => {
    if (excludeId !== null && r.id === excludeId) return false;
    return (
      r.room.toLowerCase() === rRoom &&
      r.date === date &&
      r.time === time
    );
  });
}

initDB().then(() => {
  console.log("✅ LowDB inicialitzada");

  // GET /api/reservations?room=A1&date=2025-12-19
  app.get("/api/reservations", async (req, res) => {
    await db.read();
    const { room, date } = req.query;

    let list = db.data.reservations;

    if (room) {
      const q = String(room).toLowerCase();
      list = list.filter(r => r.room.toLowerCase().includes(q));
    }
    if (date) {
      list = list.filter(r => r.date === String(date));
    }

    // Ordenació (data, hora)
    list = [...list].sort((a, b) => {
      const adt = `${a.date}T${a.time}`;
      const bdt = `${b.date}T${b.time}`;
      return adt.localeCompare(bdt);
    });

    res.json(list);
  });

  // POST /api/reservations
  app.post("/api/reservations", async (req, res) => {
    const room = normalize(req.body.room);
    const date = normalize(req.body.date);
    const time = normalize(req.body.time);
    const owner = normalize(req.body.owner);

    if (!room || !date || !time || !owner) {
      return res.status(400).json({ error: "Falten camps obligatoris (aula, data, hora, responsable)." });
    }
    if (!isValidDateYYYYMMDD(date)) {
      return res.status(400).json({ error: "Format de data incorrecte. Usa YYYY-MM-DD." });
    }
    if (!isValidTimeHHMM(time)) {
      return res.status(400).json({ error: "Format d'hora incorrecte. Usa HH:MM (24h)." });
    }

    await db.read();

    if (hasConflict(db.data.reservations, { room, date, time })) {
      return res.status(409).json({ error: "Conflicte: ja existeix una reserva per aquesta aula/data/hora." });
    }

    const newRes = {
      id: Date.now(),
      room,
      date,
      time,
      owner,
      createdAt: new Date().toISOString(),
      updatedAt: null
    };

    db.data.reservations.push(newRes);
    await db.write();

    res.status(201).json(newRes);
  });

  // PUT /api/reservations/:id (editar)
  app.put("/api/reservations/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const room = normalize(req.body.room);
    const date = normalize(req.body.date);
    const time = normalize(req.body.time);
    const owner = normalize(req.body.owner);

    if (!room || !date || !time || !owner) {
      return res.status(400).json({ error: "Falten camps obligatoris (aula, data, hora, responsable)." });
    }
    if (!isValidDateYYYYMMDD(date)) {
      return res.status(400).json({ error: "Format de data incorrecte. Usa YYYY-MM-DD." });
    }
    if (!isValidTimeHHMM(time)) {
      return res.status(400).json({ error: "Format d'hora incorrecte. Usa HH:MM (24h)." });
    }

    await db.read();
    const idx = db.data.reservations.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: "Reserva no trobada." });

    if (hasConflict(db.data.reservations, { room, date, time }, id)) {
      return res.status(409).json({ error: "Conflicte: ja existeix una altra reserva per aquesta aula/data/hora." });
    }

    db.data.reservations[idx] = {
      ...db.data.reservations[idx],
      room,
      date,
      time,
      owner,
      updatedAt: new Date().toISOString()
    };

    await db.write();
    res.json(db.data.reservations[idx]);
  });

  // DELETE /api/reservations/:id
  app.delete("/api/reservations/:id", async (req, res) => {
    const id = parseInt(req.params.id);

    await db.read();
    const before = db.data.reservations.length;
    db.data.reservations = db.data.reservations.filter(r => r.id !== id);

    if (db.data.reservations.length === before) {
      return res.status(404).json({ error: "Reserva no trobada." });
    }

    await db.write();
    res.status(204).send();
  });

  // Front
  app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "public", "index.html"));
  });

  app.listen(port, () => {
    console.log(`🚀 Servidor en marxa a http://localhost:${port}`);
  });
});
