import { NextRequest, NextResponse } from "next/server";
import { fetchAllTasks, saveParkedTasks, toggleTaskStatus } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const mongoUri = req.headers.get("x-mongo-uri") || undefined;
    const tasks = await fetchAllTasks(mongoUri);
    return NextResponse.json({ tasks });
  } catch (error: any) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks", tasks: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const mongoUri = req.headers.get("x-mongo-uri") || undefined;
    const body = await req.json();
    const { title } = body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const created = await saveParkedTasks([title.trim()], mongoUri);
    return NextResponse.json({ task: created[0] });
  } catch (error: any) {
    console.error("Error adding task:", error);
    return NextResponse.json({ error: "Failed to add task" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const mongoUri = req.headers.get("x-mongo-uri") || undefined;
    const body = await req.json();
    const { id, status } = body;
    if (!id || (status !== "PARKED" && status !== "COMPLETED")) {
      return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
    }
    const success = await toggleTaskStatus(id, status, mongoUri);
    return NextResponse.json({ success });
  } catch (error: any) {
    console.error("Error updating task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
