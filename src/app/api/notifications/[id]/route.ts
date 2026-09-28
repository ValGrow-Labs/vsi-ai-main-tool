import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDummySupabase, requireSessionApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/notifications/:id — deletes one of the signed-in user's notifications.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (isDummySupabase()) return NextResponse.json({ success: true, message: `Notification ${id} deleted` });

    // 401 signed out, 403 disabled account.
    const session = await requireSessionApi();
    if (session instanceof Response) return session;
    const supabase = await createClient();

    const { data, error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", session.userId).select("id");
    if (error) return NextResponse.json({ success: false, error: "The notification couldn't be deleted." }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ success: false, error: "Notification not found." }, { status: 404 });
    return NextResponse.json({ success: true, message: `Notification ${id} deleted` });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed to delete" },
      { status: 500 }
    );
  }
}
