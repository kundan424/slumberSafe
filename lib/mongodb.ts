import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI || "";
const options = {};

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

// In-memory fallback in case MONGODB_URI is not yet provided
export interface ParkedTask {
  _id: string;
  title: string;
  status: "PARKED" | "COMPLETED";
  createdAt: string;
}

const memoryTasks: ParkedTask[] = [];

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (uri) {
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
}

export async function getDatabase(): Promise<Db | null> {
  if (!uri || !clientPromise) {
    return null;
  }
  try {
    const connectedClient = await clientPromise;
    return connectedClient.db("slumbersafe");
  } catch (error) {
    console.error("Failed to connect to MongoDB Atlas:", error);
    return null;
  }
}

export async function saveParkedTasks(tasks: string[]): Promise<ParkedTask[]> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  if (db) {
    const docs = tasks.map((title) => ({
      title,
      status: "PARKED" as const,
      createdAt: now,
    }));

    if (docs.length > 0) {
      const result = await db.collection("parked_tasks").insertMany(docs);
      return docs.map((doc, idx) => ({
        _id: result.insertedIds[idx]?.toString() || `${Date.now()}-${idx}`,
        title: doc.title,
        status: doc.status,
        createdAt: doc.createdAt,
      }));
    }
    return [];
  }

  // Fallback to memory tasks if MongoDB URI is not configured
  const newTasks: ParkedTask[] = tasks.map((title, idx) => ({
    _id: `mem-${Date.now()}-${idx}`,
    title,
    status: "PARKED",
    createdAt: now,
  }));
  memoryTasks.unshift(...newTasks);
  return newTasks;
}

export async function fetchAllTasks(): Promise<ParkedTask[]> {
  const db = await getDatabase();
  if (db) {
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
  }

  return [...memoryTasks];
}

export async function toggleTaskStatus(
  id: string,
  newStatus: "PARKED" | "COMPLETED"
): Promise<boolean> {
  const db = await getDatabase();
  if (db) {
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
    return result.matchedCount > 0;
  }

  const task = memoryTasks.find((t) => t._id === id);
  if (task) {
    task.status = newStatus;
    return true;
  }
  return false;
}
