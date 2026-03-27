import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const params = await context.params;
    const { eventId } = params;
    const body = await request.json();
    
    // allow partial updates
    const updateData: any = {};
    if (body.eventName !== undefined) updateData.eventName = body.eventName;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.triggerType !== undefined) updateData.triggerType = body.triggerType;
    if (body.triggerCondition !== undefined) updateData.triggerCondition = body.triggerCondition;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.priority !== undefined) updateData.priority = body.priority;

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: updateData
    });

    return NextResponse.json(updatedEvent);
  } catch (error) {
    console.error("Update Event Error:", error);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const params = await context.params;
    const { eventId } = params;
    
    await prisma.event.delete({
      where: { id: eventId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete Event Error:", error);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
