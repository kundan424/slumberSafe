import { MongoClient, Db } from "mongodb";

export interface ParkedTask {
  _id: string;
  title: string;
  status: "PARKED" | "COMPLETED";
  createdAt: string;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _slumberMemoryTasks: ParkedTask[] | undefined;
}

if (!globalThis._slumberMemoryTasks) {
  globalThis._slumberMemoryTasks = [];
}

function getMemoryStore(): ParkedTask[] {
  if (!globalThis._slumberMemoryTasks) {
    globalThis._slumberMemoryTasks = [];
  }
  return globalThis._slumberMemoryTasks;
}

export async function getDatabase(customUri?: string): Promise<Db | null> {
  const uri = customUri || process.env.MONGODB_URI || "";
  if (!uri) return null;

  try {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri, {});
      global._mongoClientPromise = client.connect();
    }
    const connectedClient = await global._mongoClientPromise;
    return connectedClient.db("slumbersafe");
  } catch (error) {
    console.error("Failed to connect to MongoDB Atlas:", error);
    return null;
  }
}

export async function saveParkedTasks(
  tasks: string[],
  customUri?: string
): Promise<ParkedTask[]> {
  const cleanTasks = tasks
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (cleanTasks.length === 0) return [];

  const now = new Date().toISOString();
  const db = await getDatabase(customUri);

  if (db) {
    const docs = cleanTasks.map((title) => ({
      title,
      status: "PARKED" as const,
      createdAt: now,
    }));

    try {
      const result = await db.collection("parked_tasks").insertMany(docs);
      return docs.map((doc, idx) => ({
        _id: result.insertedIds[idx]?.toString() || `${Date.now()}-${idx}`,
        title: doc.title,
        status: doc.status,
        createdAt: doc.createdAt,
      }));
    } catch (err) {
      console.warn("MongoDB insert error, falling back to memory store:", err);
    }
  }

  // Reliable cross-route global memory store
  const store = getMemoryStore();
  const newTasks: ParkedTask[] = cleanTasks.map((title, idx) => ({
    _id: `task-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
    title,
    status: "PARKED",
    createdAt: now,
  }));
  store.unshift(...newTasks);
  return newTasks;
}

export async function fetchAllTasks(customUri?: string): Promise<ParkedTask[]> {
  const db = await getDatabase(customUri);
  if (db) {
    try {
      const docs = await db
        .collection("parked_tasks")
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      return docs.map((doc) => ({
        _id: doc._id.toString(),
        title: doc.title as string,
        status: (doc.status as "PARKED" | "COMPLETED") || "PARKED",
        createdAt: doc.createdAt as string,
      }));
    } catch (err) {
      console.warn("MongoDB fetch error, falling back to memory store:", err);
    }
  }

  const store = getMemoryStore();
  return [...store];
}

export async function toggleTaskStatus(
  id: string,
  newStatus: "PARKED" | "COMPLETED",
  customUri?: string
): Promise<boolean> {
  const db = await getDatabase(customUri);
  if (db) {
    try {
      const { ObjectId } = await import("mongodb");
      let filter: any;
      try {
        filter = { _id: new ObjectId(id) };
      } catch {
        filter = { _id: id };
      }
      const result = await db
        .collection("parked_tasks")
        .updateOne(filter, { $set: { status: newStatus } });
      if (result.matchedCount > 0) return true;
    } catch (err) {
      console.warn("MongoDB update error, updating memory store:", err);
    }
  }

  const store = getMemoryStore();
  const task = store.find((t) => t._id === id);
  if (task) {
    task.status = newStatus;
    return true;
  }
  return false;
}
