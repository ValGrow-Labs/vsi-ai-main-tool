import { NextResponse } from "next/server";

// This endpoint never cleared anything. Clearing is DELETE /api/notifications.
const notSupported = () =>
  NextResponse.json({ success: false, error: "Use DELETE /api/notifications to clear notifications." }, { status: 410 });

export const DELETE = notSupported;
export const PATCH = notSupported;
